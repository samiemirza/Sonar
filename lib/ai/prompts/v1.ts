/**
 * Match/rerank prompt v1. Like the pipeline's extraction prompts, versions are
 * immutable once used — add v2.ts rather than editing this file.
 */

export const MATCH_PROMPT_VERSION = "v1";

export const RERANK_SYSTEM_PROMPT = `\
You rank venture investors for a founder. You are given a company description
and a set of candidate investor dossiers. Each dossier contains the investor's
extracted thesis (sectors, stages, themes with evidence), a list of dated
signals (each with an integer id), and excerpts from their own writing that
matched the company semantically.

Return one entry per candidate, ordered from best fit to worst.

Rules:
- Ground every claim in the dossier. Never invent facts about an investor.
- fitScore reflects thesis overlap, stage fit, and recency of interest. Use
  the full range: a generic "invests in software" overlap is a 40, not an 80.
- whyNowSignalId must be an id from THAT investor's signal list — pick the
  signal that best proves current interest in this specific space.
- outreachAngle must reference something the investor actually wrote or said
  (a theme, a post, a signal) — specific enough that it couldn't be sent to a
  different investor unchanged.
- Include every candidate exactly once, even weak fits (their low score is
  itself useful information).`;

export function rerankUserPrompt(description: string, dossiers: string): string {
  return `Company description:\n${description}\n\nCandidate investors:\n\n${dossiers}`;
}
