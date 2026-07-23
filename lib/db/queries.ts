import { desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./index";
import {
  chunks,
  investors,
  signals,
  sources,
  theses,
  type Investor,
  type Signal,
  type Thesis,
} from "./schema";

export type ChunkHit = {
  chunkId: number;
  text: string;
  sourceId: number;
  sourceUrl: string;
  sourceTitle: string | null;
  investorId: number;
  similarity: number;
};

/** pgvector cosine search over chunks, joined to their source + investor. */
export async function searchChunks(
  db: Db,
  embedding: number[],
  limit = 80,
): Promise<ChunkHit[]> {
  const vec = `[${embedding.join(",")}]`;
  return db
    .select({
      chunkId: chunks.id,
      text: chunks.text,
      sourceId: sources.id,
      sourceUrl: sources.url,
      sourceTitle: sources.title,
      investorId: sources.investorId,
      similarity: sql<number>`1 - (${chunks.embedding} <=> ${vec}::vector)`,
    })
    .from(chunks)
    .innerJoin(sources, eq(chunks.sourceId, sources.id))
    .where(isNotNull(chunks.embedding))
    .orderBy(sql`${chunks.embedding} <=> ${vec}::vector`)
    .limit(limit);
}

export type CandidateInvestor = {
  investor: Investor;
  thesis: Thesis;
  signals: Signal[];
};

/** Load full dossiers (investor + thesis + signals) for a set of investor ids. */
export async function getCandidates(
  db: Db,
  investorIds: number[],
): Promise<CandidateInvestor[]> {
  if (investorIds.length === 0) return [];
  const [investorRows, thesisRows, signalRows] = await Promise.all([
    db.select().from(investors).where(inArray(investors.id, investorIds)),
    db.select().from(theses).where(inArray(theses.investorId, investorIds)),
    db
      .select()
      .from(signals)
      .where(inArray(signals.investorId, investorIds))
      .orderBy(desc(signals.signalDate)),
  ]);
  const thesisByInvestor = new Map(thesisRows.map((t) => [t.investorId, t]));
  return investorRows.flatMap((investor) => {
    const thesis = thesisByInvestor.get(investor.id);
    if (!thesis) return []; // no extracted thesis yet — not rankable
    return [
      {
        investor,
        thesis,
        signals: signalRows.filter((s) => s.investorId === investor.id),
      },
    ];
  });
}

export async function getSourcesByIds(db: Db, ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: sources.id,
      url: sources.url,
      title: sources.title,
      kind: sources.kind,
      publishedAt: sources.publishedAt,
    })
    .from(sources)
    .where(inArray(sources.id, ids));
}

export type InvestorDetail = {
  investor: Investor;
  thesis: Thesis | null;
  signals: (Signal & { sourceUrl: string; sourceTitle: string | null })[];
  sources: { id: number; url: string; title: string | null; kind: string; publishedAt: Date | null }[];
};

export async function getInvestorDetail(
  db: Db,
  slug: string,
): Promise<InvestorDetail | null> {
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.slug, slug))
    .limit(1);
  if (!investor) return null;

  const [thesisRows, signalRows, sourceRows] = await Promise.all([
    db.select().from(theses).where(eq(theses.investorId, investor.id)).limit(1),
    db
      .select({
        id: signals.id,
        investorId: signals.investorId,
        claim: signals.claim,
        signalDate: signals.signalDate,
        strength: signals.strength,
        sourceId: signals.sourceId,
        sourceUrl: sources.url,
        sourceTitle: sources.title,
      })
      .from(signals)
      .innerJoin(sources, eq(signals.sourceId, sources.id))
      .where(eq(signals.investorId, investor.id))
      .orderBy(desc(signals.signalDate)),
    db
      .select({
        id: sources.id,
        url: sources.url,
        title: sources.title,
        kind: sources.kind,
        publishedAt: sources.publishedAt,
      })
      .from(sources)
      .where(eq(sources.investorId, investor.id))
      .orderBy(desc(sources.publishedAt)),
  ]);

  return {
    investor,
    thesis: thesisRows[0] ?? null,
    signals: signalRows,
    sources: sourceRows,
  };
}

export async function listInvestorsWithTheses(db: Db) {
  return db
    .select({
      slug: investors.slug,
      name: investors.name,
      firm: investors.firm,
    })
    .from(investors)
    .innerJoin(theses, eq(theses.investorId, investors.id))
    .orderBy(investors.name);
}
