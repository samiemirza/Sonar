import { openai } from "@ai-sdk/openai";
import { embed, generateText } from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Deployment diagnostic. Hit GET /api/health in the browser after deploying to
 * see which dependency is misconfigured. Reports presence + reachability only —
 * never the secret values themselves.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    openAIKeyLength: process.env.OPENAI_API_KEY?.length ?? 0,
  };

  // Database: reachable + pointing at the populated DB?
  try {
    const db = getDb();
    const result = await db.execute(
      sql`SELECT
        (SELECT count(*) FROM investors) AS investors,
        (SELECT count(*) FROM theses) AS theses,
        (SELECT count(*) FROM chunks WHERE embedding IS NOT NULL) AS embedded_chunks`,
    );
    checks.database = { ok: true, counts: result.rows[0] };
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // OpenAI embeddings: key valid + model reachable at the expected dimensions?
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: "health check",
      providerOptions: { openai: { dimensions: 1024 } },
    });
    checks.openaiEmbedding = { ok: true, dimensions: embedding.length };
  } catch (err) {
    checks.openaiEmbedding = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // The rerank model — the second OpenAI call the match flow makes. A key can
  // reach embeddings but lack access to this model, which fails matches only.
  try {
    await generateText({
      model: openai("gpt-5-mini"),
      prompt: "Reply with OK.",
      providerOptions: { openai: { reasoningEffort: "minimal" } },
    });
    checks.openaiRerankModel = { ok: true, model: "gpt-5-mini" };
  } catch (err) {
    checks.openaiRerankModel = {
      ok: false,
      model: "gpt-5-mini",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const healthy =
    checks.hasDatabaseUrl &&
    checks.hasOpenAIKey &&
    (checks.database as { ok?: boolean })?.ok &&
    (checks.openaiEmbedding as { ok?: boolean })?.ok &&
    (checks.openaiRerankModel as { ok?: boolean })?.ok;

  return Response.json(
    { healthy, ...checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
