import { matchInvestors } from "@/lib/ai/match";
import { matchRequestSchema } from "@/lib/ai/schemas";

export const maxDuration = 300;

/**
 * POST { description } → ndjson stream, one resolved MatchCard per line,
 * best fit first. Cards stream as the rerank model finishes each one.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = matchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "description must be a string of 10-2000 characters" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const card of matchInvestors(parsed.data.description)) {
          controller.enqueue(encoder.encode(JSON.stringify(card) + "\n"));
        }
      } catch (err) {
        console.error("match stream failed:", err);
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: "match failed" }) + "\n"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
