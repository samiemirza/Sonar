# Sonar — investor signal & matching engine

Paste a one-line company description → get a ranked shortlist of investors who are
*currently* signaling public interest in your space. Every claim links back to the
exact blog post, newsletter, or talk it was extracted from.

**Live:** https://investor-tool-8x-plays.vercel.app

## How it works

An offline Python pipeline ingests public writing from ~50 curated investors
(blogs, RSS, YouTube transcripts), chunks and embeds it into Neon Postgres +
pgvector, then runs structured LLM extraction to produce per-investor **theses**
and dated **signals** — each row carrying the id of the source it came from.
The provenance rule is non-negotiable: no thesis field and no signal exists
without a source.

The online Next.js app embeds your description, retrieves semantically matching
investor writing via pgvector, and streams an LLM-reranked shortlist: fit score,
grounded reasoning, the single best "why now" signal (dated, sourced), and a
tailored outreach angle. The rerank model cites signals **by id**; the server
resolves claims, dates, and URLs from the database, so nothing user-facing is
unverifiable model text.

## MCP server

The same matching engine is exposed as an MCP server at `/api/mcp`
(streamable HTTP) with two tools:

- `match_investors(company_description, stage?)` — ranked matches with sources
- `get_investor_signals(investor_slug)` — full thesis + dated signal timeline

Connect from Claude Code:

```bash
claude mcp add --transport http sonar https://investor-tool-8x-plays.vercel.app/api/mcp
```

Or in any MCP client config:

```json
{ "mcpServers": { "sonar": { "url": "https://investor-tool-8x-plays.vercel.app/api/mcp" } } }
```

Smoke-test a running server: `node scripts/mcp-smoke.mjs http://localhost:3000`

## Running locally

```bash
npm install && npm run dev          # web app on :3000 (needs DATABASE_URL, OPENAI_API_KEY in .env)

cd pipeline
uv run pipeline seed                # upsert investors from sources/seed_investors.yaml
uv run pipeline ingest              # fetch + chunk + embed public sources
uv run pipeline extract             # structured thesis/signal extraction (provenance-checked)
uv run pipeline stats               # row counts
```

## Deliberately out of scope

- No auth or accounts — one input, instant value.
- Public, ToS-clean sources only (see `docs/DATA_SOURCES.md`) — no LinkedIn,
  no login-walled content.
- ~50 curated investors, depth over breadth — not an investor database.
- No agentic browsing at request time — ingestion is batch; serving is fast
  and deterministic.
