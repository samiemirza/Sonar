import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { matchInvestors } from "@/lib/ai/match";
import type { MatchCard } from "@/lib/ai/schemas";
import { getDb } from "@/lib/db";
import { getInvestorDetail, listInvestorsWithTheses } from "@/lib/db/queries";

const STAGES = ["pre-seed", "seed", "series-a", "series-b", "growth"] as const;

function json(payload: unknown, isError = false) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Both tools are thin wrappers over the same lib/ai + lib/db functions the
 * web app uses — one logic path, two surfaces.
 */
export function registerTools(server: McpServer) {
  server.registerTool(
    "match_investors",
    {
      title: "Match investors to a company",
      description:
        "Rank venture investors who are currently signaling public interest in a company's space. " +
        "Takes a one-line company description and returns scored matches (0-100) with grounded " +
        "reasoning, a dated 'why now' signal, an outreach angle, and the public source URL behind " +
        "every claim.",
      inputSchema: {
        company_description: z
          .string()
          .min(10)
          .max(2000)
          .describe("One-to-three-sentence description of the company"),
        stage: z
          .enum(STAGES)
          .optional()
          .describe(
            "Optional fundraising stage filter; ignored if no ranked investor invests at that stage",
          ),
      },
    },
    async ({ company_description, stage }) => {
      const matches: MatchCard[] = [];
      for await (const card of matchInvestors(company_description, { stage })) {
        matches.push(card);
      }
      return json({
        matches,
        note:
          "fitScore reflects thesis overlap, stage fit, and recency of public signals. " +
          "Every whyNow claim links to the exact public source it was extracted from.",
      });
    },
  );

  server.registerTool(
    "get_investor_signals",
    {
      title: "Get an investor's thesis and signal timeline",
      description:
        "Full extracted profile for one investor: current thesis (summary, sectors, stages, " +
        "themes with verbatim evidence) and a dated timeline of interest signals, each with " +
        "strength 1-5 and the public source URL it was extracted from.",
      inputSchema: {
        investor_slug: z
          .string()
          .describe(
            "Investor slug, e.g. 'elad-gil' — as returned by match_investors",
          ),
      },
    },
    async ({ investor_slug }) => {
      const db = getDb();
      const detail = await getInvestorDetail(db, investor_slug);
      if (!detail) {
        const known = await listInvestorsWithTheses(db);
        return json(
          {
            error: `No investor with slug '${investor_slug}'`,
            available_slugs: known.map((k) => k.slug),
          },
          true,
        );
      }
      const { investor, thesis, signals, sources } = detail;
      const sourceById = new Map(sources.map((s) => [s.id, s]));
      return json({
        investor: {
          name: investor.name,
          firm: investor.firm,
          slug: investor.slug,
          type: investor.type,
          siteUrl: investor.siteUrl,
        },
        thesis: thesis
          ? {
              summary: thesis.summary,
              sectors: thesis.sectors,
              stages: thesis.stages.length ? thesis.stages : investor.stageFocus,
              checkSize: thesis.checkSize,
              themes: thesis.themes.map((t) => ({
                theme: t.theme,
                evidence: t.evidence,
                sourceUrl: sourceById.get(t.sourceId)?.url ?? null,
              })),
              extractedAt: thesis.extractedAt.toISOString(),
              promptVersion: thesis.promptVersion,
            }
          : null,
        signals: signals.map((s) => ({
          date: s.signalDate.toISOString().slice(0, 10),
          strength: s.strength,
          claim: s.claim,
          sourceUrl: s.sourceUrl,
          sourceTitle: s.sourceTitle,
        })),
      });
    },
  );
}
