import { z } from "zod";

/**
 * What the rerank LLM returns per investor. Provenance-critical fields
 * (signal claim, source URL, dates) are NOT free text from the model — it
 * references a signal by id and the server resolves the rest from the DB.
 */
export const rerankedMatchSchema = z.object({
  slug: z.string().describe("Investor slug, copied exactly from the dossier"),
  fitScore: z
    .number()
    .describe("0-100 fit between the company and this investor's current thesis"),
  reasoning: z
    .string()
    .describe(
      "2-3 sentences on why this investor fits (or where the fit is imperfect), grounded in their thesis and signals",
    ),
  whyNowSignalId: z
    .number()
    .describe(
      "id of the single signal that best shows this investor is interested RIGHT NOW; pick from the dossier's signal list",
    ),
  whyNow: z
    .string()
    .describe("One sentence connecting that signal to this company"),
  outreachAngle: z
    .string()
    .describe(
      "One concrete, specific opening line/angle the founder could use, referencing the investor's own writing",
    ),
});

export type RerankedMatch = z.infer<typeof rerankedMatchSchema>;

/** Fully-resolved card streamed to the client (one ndjson line each). */
export type MatchCard = {
  slug: string;
  name: string;
  firm: string | null;
  type: "fund" | "angel";
  stages: string[];
  sectors: string[];
  fitScore: number;
  reasoning: string;
  outreachAngle: string;
  whyNow: {
    text: string;
    claim: string;
    date: string; // ISO
    strength: number;
    source: { id: number; url: string; title: string | null };
  } | null;
};

export const matchRequestSchema = z.object({
  description: z.string().trim().min(10).max(2000),
});
