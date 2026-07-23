import { openai } from "@ai-sdk/openai";
import { embed, streamObject } from "ai";
import { getDb } from "@/lib/db";
import {
  getCandidates,
  getSourcesByIds,
  searchChunks,
  type CandidateInvestor,
  type ChunkHit,
} from "@/lib/db/queries";
import { RERANK_SYSTEM_PROMPT, rerankUserPrompt } from "./prompts/v1";
import { rerankedMatchSchema, type MatchCard } from "./schemas";

const RERANK_MODEL = "gpt-5-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024; // must match the pgvector column + pipeline
const CHUNK_POOL = 80; // vector hits considered
const MAX_CANDIDATES = 10; // dossiers sent to the rerank pass
const EXCERPTS_PER_INVESTOR = 2;

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text,
    providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
  });
  return embedding;
}

/**
 * Hybrid retrieval: pgvector top-K chunks → aggregate per investor
 * (sum of top-3 chunk similarities, so one lucky chunk doesn't dominate
 * but breadth of overlap counts).
 */
export function rankInvestors(hits: ChunkHit[]): {
  investorIds: number[];
  excerptsByInvestor: Map<number, ChunkHit[]>;
} {
  const byInvestor = new Map<number, ChunkHit[]>();
  for (const hit of hits) {
    const list = byInvestor.get(hit.investorId) ?? [];
    list.push(hit);
    byInvestor.set(hit.investorId, list);
  }
  const scored = [...byInvestor.entries()].map(([investorId, list]) => ({
    investorId,
    score: list
      .slice(0, 3)
      .reduce((acc, h) => acc + h.similarity, 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const investorIds = scored.slice(0, MAX_CANDIDATES).map((s) => s.investorId);
  return { investorIds, excerptsByInvestor: byInvestor };
}

function buildDossier(
  candidate: CandidateInvestor,
  excerpts: ChunkHit[],
): string {
  const { investor, thesis, signals } = candidate;
  const lines: string[] = [
    `### ${investor.name}${investor.firm ? ` — ${investor.firm}` : ""} (slug: ${investor.slug}, ${investor.type})`,
    `Stage focus: ${thesis.stages.length ? thesis.stages.join(", ") : investor.stageFocus.join(", ") || "unknown"}`,
    `Sectors: ${thesis.sectors.join(", ")}`,
    `Thesis: ${thesis.summary}`,
  ];
  if (thesis.checkSize) lines.push(`Check size: ${thesis.checkSize}`);
  if (thesis.themes.length) {
    lines.push("Themes:");
    for (const t of thesis.themes) {
      lines.push(`- ${t.theme}: "${t.evidence}"`);
    }
  }
  if (signals.length) {
    lines.push("Signals (id | date | strength 1-5 | claim):");
    for (const s of signals.slice(0, 8)) {
      lines.push(
        `- ${s.id} | ${s.signalDate.toISOString().slice(0, 10)} | ${s.strength} | ${s.claim}`,
      );
    }
  }
  if (excerpts.length) {
    lines.push("Writing excerpts that matched the company semantically:");
    for (const e of excerpts.slice(0, EXCERPTS_PER_INVESTOR)) {
      lines.push(`> ${e.text.slice(0, 400).replaceAll("\n", " ")}`);
    }
  }
  return lines.join("\n");
}

function resolveCard(
  candidate: CandidateInvestor,
  match: {
    fitScore: number;
    reasoning: string;
    whyNowSignalId: number;
    whyNow: string;
    outreachAngle: string;
  },
  sourceById: Map<number, { id: number; url: string; title: string | null }>,
): MatchCard {
  const { investor, thesis, signals } = candidate;
  // Provenance: the cited signal must belong to this investor. If the model
  // picked a bad id, fall back to the strongest recent signal rather than
  // rendering an unverifiable claim.
  const signal =
    signals.find((s) => s.id === match.whyNowSignalId) ??
    [...signals].sort(
      (a, b) =>
        b.strength - a.strength ||
        b.signalDate.getTime() - a.signalDate.getTime(),
    )[0];
  const source = signal ? sourceById.get(signal.sourceId) : undefined;
  return {
    slug: investor.slug,
    name: investor.name,
    firm: investor.firm,
    type: investor.type,
    stages: thesis.stages.length ? thesis.stages : investor.stageFocus,
    sectors: thesis.sectors,
    fitScore: Math.round(Math.min(100, Math.max(0, match.fitScore))),
    reasoning: match.reasoning,
    outreachAngle: match.outreachAngle,
    whyNow:
      signal && source
        ? {
            text: match.whyNow,
            claim: signal.claim,
            date: signal.signalDate.toISOString(),
            strength: signal.strength,
            source,
          }
        : null,
  };
}

/**
 * Full match flow. Returns an async generator of resolved MatchCards, in the
 * order the rerank model emits them (best fit first).
 */
export async function* matchInvestors(
  description: string,
): AsyncGenerator<MatchCard> {
  const db = getDb();
  const queryEmbedding = await embedQuery(description);
  const hits = await searchChunks(db, queryEmbedding, CHUNK_POOL);
  const { investorIds, excerptsByInvestor } = rankInvestors(hits);
  const candidates = await getCandidates(db, investorIds);
  if (candidates.length === 0) return;

  // Preserve retrieval order for the dossier list.
  const order = new Map(investorIds.map((id, i) => [id, i]));
  candidates.sort(
    (a, b) => (order.get(a.investor.id) ?? 99) - (order.get(b.investor.id) ?? 99),
  );

  const signalSourceIds = [
    ...new Set(candidates.flatMap((c) => c.signals.map((s) => s.sourceId))),
  ];
  const sourceRows = await getSourcesByIds(db, signalSourceIds);
  const sourceById = new Map(
    sourceRows.map((s) => [s.id, { id: s.id, url: s.url, title: s.title }]),
  );

  const dossiers = candidates
    .map((c) => buildDossier(c, excerptsByInvestor.get(c.investor.id) ?? []))
    .join("\n\n");

  const bySlug = new Map(candidates.map((c) => [c.investor.slug, c]));

  const { elementStream } = streamObject({
    model: openai(RERANK_MODEL),
    output: "array",
    schema: rerankedMatchSchema,
    system: RERANK_SYSTEM_PROMPT,
    prompt: rerankUserPrompt(description, dossiers),
    // "minimal" keeps time-to-first-card low; ranking quality comes from the
    // dossier structure, not chain-of-thought.
    providerOptions: { openai: { reasoningEffort: "minimal" } },
  });

  const seen = new Set<string>();
  for await (const element of elementStream) {
    const candidate = bySlug.get(element.slug);
    if (!candidate || seen.has(element.slug)) continue; // hallucinated or duplicate slug
    seen.add(element.slug);
    yield resolveCard(candidate, element, sourceById);
  }
}
