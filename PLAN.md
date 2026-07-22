# Sonar — Investor Signal & Matching Engine

A vertical slice of Metal's **Content Signals** + **Investor Patterns**: paste a one-line company description, get a ranked shortlist of investors who are *currently* signaling interest in your space — every claim linked back to its public source. Exposed as both a web app and an **MCP server**.

Built as a hiring demo for Metal. The goal of every technical choice below is to visibly demonstrate three skill profiles in one codebase:

| Role | What in this project proves it |
|---|---|
| **SWE** | Typed end-to-end codebase, real schema design, API design, tests, CI, clean deploy pipeline |
| **AI Engineer** | Ingestion → chunking → embeddings → hybrid retrieval → structured LLM extraction → **eval harness** with versioned prompts |
| **Forward Deployed Engineer** | MCP server integration, provenance-first output (every claim cites its source), demo-ready live deployment, productionization notes |

---

## 1. System Overview

```
                        ┌─────────────────────────────────────────┐
                        │              OFFLINE (batch)            │
  Public sources ──────▶│  Python ingestion pipeline              │
  (blogs, RSS,          │  fetch → clean → chunk → embed          │
   YT transcripts,      │  LLM thesis extraction (structured)     │
   public X posts)      │  eval harness scores extraction quality │
                        └───────────────┬─────────────────────────┘
                                        │ writes
                                        ▼
                        ┌─────────────────────────────────────────┐
                        │   Neon Postgres + pgvector (Drizzle)    │
                        │   investors · sources · chunks ·        │
                        │   theses · signals (all with citations) │
                        └───────────────┬─────────────────────────┘
                                        │ reads
                        ┌───────────────┴─────────────────────────┐
                        │           ONLINE (Vercel)               │
                        │  Next.js app ── /api/match (streaming)  │
                        │       │        embeddings retrieval +   │
                        │       │        LLM rerank/fit-score     │
                        │       └── /api/mcp  (MCP server:        │
                        │            match_investors,             │
                        │            get_investor_signals)        │
                        └─────────────────────────────────────────┘
```

Two halves, deliberately separated:

- **Offline ingestion (Python)** — batch scripts, run locally or via cron. This is where the AI-engineering work lives and where messy real-world data gets tamed.
- **Online app (TypeScript/Next.js)** — the live product surface: web UI, streaming match API, and MCP server. Fast, typed, deployed on Vercel.

This split is itself a signal: it shows you know inference-time serving and data pipelines are different disciplines with different stacks.

---

## 2. Tech Stack

### Online app (SWE + FDE surface)
| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router) + TypeScript** | Metal-adjacent YC standard; RSC + streaming |
| UI | **Tailwind CSS + shadcn/ui** | Fast, polished, no design debt |
| LLM access | **Vercel AI SDK v6 via AI Gateway** (`"anthropic/claude-sonnet-5"` model strings) | Provider-agnostic, built-in observability, fallbacks — the "production LLM plumbing" signal |
| ORM | **Drizzle** | Typed schema shared across API + MCP routes |
| Database | **Neon Postgres + pgvector** (Vercel Marketplace) | One DB for relational + vector; no extra infra |
| MCP server | **`@modelcontextprotocol/sdk`**, streamable HTTP transport mounted at `/api/mcp` | Same deployment, zero extra hosting; Claude/Cursor can connect to the live URL |
| Hosting | **Vercel** (Fluid Compute, 300s timeouts fine for LLM calls) | One-click live link; cron for refresh |

### Offline pipeline (AI Engineer surface)
| Layer | Choice | Why |
|---|---|---|
| Language | **Python 3.12 + uv** | The AI-engineering lingua franca; shows you're bilingual |
| HTTP/parsing | `httpx`, `trafilatura` (article extraction), `feedparser` (RSS) | Robust text from messy pages |
| Transcripts | `youtube-transcript-api` | Podcast/talk transcripts without scraping |
| LLM calls | **OpenAI SDK, structured outputs** | Schema-enforced thesis extraction, no JSON parsing hacks |
| Embeddings | **OpenAI text-embedding-3-small (dimensions=1024)** | Quality retrieval; stored in pgvector |
| Validation | `pydantic` models mirroring the Drizzle schema | Typed at both ends of the pipe |
| Evals | Hand-rolled eval harness (golden set + LLM-judge) in `evals/` | The single strongest AI-engineer signal |

### Shared / infra
- **GitHub Actions**: typecheck, lint, unit tests, eval smoke-run on PR.
- **Vercel Cron** → `/api/refresh` for periodic re-ingestion of RSS feeds (lightweight sources only; heavy ingestion stays a manual script).
- **No auth, no accounts** — deliberately out of scope. One input, instant value.

---

## 3. Repository Layout

```
investor-tool/
├── PLAN.md                       # this file
├── README.md                     # demo-first: live link, 3 screenshots, MCP connect snippet
├── docs/
│   ├── PRODUCTIONIZE.md          # "how I'd take this to prod" — the seniority signal
│   └── DATA_SOURCES.md           # every source used + why it's public/ToS-clean
│
├── app/                          # Next.js App Router
│   ├── page.tsx                  # landing: company-description input + examples
│   ├── results/                  # streamed ranked investor cards
│   ├── investor/[slug]/page.tsx  # deep-dive: full thesis + signal timeline w/ sources
│   └── api/
│       ├── match/route.ts        # POST: description → retrieval → rerank → stream cards
│       ├── mcp/route.ts          # MCP server (streamable HTTP)
│       └── refresh/route.ts      # cron-triggered light re-ingestion (RSS only)
│
├── components/                   # shadcn-based UI
│   ├── investor-card.tsx         # thesis, "why now" signal, fit score, outreach angle
│   ├── source-chip.tsx           # ★ clickable provenance link on EVERY claim
│   └── fit-gauge.tsx
│
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle: investors, sources, chunks, theses, signals
│   │   └── queries.ts
│   ├── ai/
│   │   ├── prompts/              # versioned prompt files (v1.ts, v2.ts…) — not inline strings
│   │   ├── match.ts              # embed query → pgvector search → LLM rerank + fit reasoning
│   │   └── schemas.ts            # zod schemas for all structured LLM output
│   └── mcp/
│       └── tools.ts              # match_investors, get_investor_signals (reuses lib/ai)
│
├── pipeline/                     # Python (uv project)
│   ├── pyproject.toml
│   ├── sources/
│   │   ├── seed_investors.yaml   # ~60 hand-curated investors + their public source URLs
│   │   ├── fetch_blogs.py        # trafilatura article extraction
│   │   ├── fetch_rss.py
│   │   └── fetch_transcripts.py  # YouTube captions
│   ├── extract/
│   │   ├── chunk.py              # semantic chunking w/ overlap
│   │   ├── embed.py              # batch embeddings → pgvector
│   │   └── thesis.py             # structured extraction: sectors, stage, themes,
│   │                             #   recent signals — each field carries source_id
│   ├── models.py                 # pydantic mirrors of DB schema
│   └── run.py                    # CLI: `uv run pipeline ingest --investor a16z`
│
├── evals/
│   ├── golden/                   # 15–20 hand-labeled investor theses (ground truth)
│   ├── run_evals.py              # extraction accuracy + LLM-judge on fit explanations
│   └── results/                  # committed eval scores per prompt version — shows iteration
│
└── .github/workflows/ci.yml
```

---

## 4. Data Model (Drizzle / Postgres)

```
investors   id · name · firm · slug · type (fund/angel) · stage_focus[] · site_url
sources     id · investor_id · url · kind (blog|rss|transcript|x_post) · title
            · published_at · fetched_at · raw_text
chunks      id · source_id · text · embedding vector(1024) · token_count
theses      id · investor_id · sectors[] · stages[] · themes jsonb · check_size
            · summary · extracted_at · prompt_version · source_ids[]   ← provenance
signals     id · investor_id · claim · signal_date · strength (1-5)
            · source_id (NOT NULL)                                     ← provenance
matches     (not stored — computed per request; log to console/AI Gateway only)
```

**The provenance rule (non-negotiable):** no `thesis` field and no `signal` row exists without a `source_id`. The UI renders every claim with a `source-chip` linking to the exact post/transcript. This is the product-maturity detail Metal engineers will notice first.

---

## 5. Core Flows

### 5.1 Ingestion (offline, Python)
1. `seed_investors.yaml`: ~60 investors, each with 2–5 public source URLs (firm blog, partner Substack, podcast channel, public X). **Public-only; no login-walled sources, ever** (documented per-source in `DATA_SOURCES.md`).
2. Fetch → clean text (`trafilatura`) → store `sources`.
3. Chunk (~500 tokens, 15% overlap) → embed → store `chunks` in pgvector.
4. Thesis extraction: per investor, feed recent chunks to Claude with a tool-use schema → structured `theses` + dated `signals`, each field tagged with the chunk's `source_id`. Prompt version recorded on every row.

### 5.2 Matching (online, `/api/match`)
1. Embed the founder's description.
2. pgvector top-K over `chunks` + keyword filter on `theses.sectors/stages` (hybrid retrieval).
3. Aggregate to candidate investors (~15).
4. Single LLM rerank pass (AI SDK `streamObject`): for each finalist → fit score 0–100 + reasoning, the single best "why now" signal (with source), suggested outreach angle.
5. Stream cards to the UI as they resolve; render fit gauge + source chips.

### 5.3 MCP server (`/api/mcp`)
Two tools, thin wrappers over the same `lib/ai` functions the web app uses (one logic path — an FDE habit):
- `match_investors(company_description, stage?)` → ranked JSON with sources
- `get_investor_signals(investor_slug)` → thesis + dated signal timeline

README includes the one-liner to add it to Claude Code/Desktop, so a Metal engineer can try it against the **live URL** in under a minute.

### 5.4 Evals (offline, Python)
- Golden set: 15–20 investors hand-labeled (true sectors/stage/themes from their own site).
- `run_evals.py`: precision/recall on extracted sectors & stages; LLM-judge (rubric-scored) on signal accuracy and fit-explanation groundedness.
- Scores committed per prompt version in `evals/results/` → the README shows a small table: *"v1 → v3 improved sector precision 71% → 92%."* That table is the proof you iterate like an AI engineer instead of vibing prompts.

---

## 6. Build Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Scaffold** (½ day) | Next.js + Tailwind + shadcn, Drizzle + Neon, uv project, CI | Deployed "hello" on Vercel; `drizzle-kit push` works |
| **1. Data** (1 day) | Seed YAML (60 investors), fetchers, chunk + embed | ≥150 sources ingested; vector search returns sane neighbors |
| **2. Extraction** (1 day) | Thesis + signal extraction w/ provenance, prompt v1 | 60 theses in DB, spot-checked; every signal has a source |
| **3. Matching + UI** (1–1.5 days) | `/api/match` streaming, cards, investor detail page | Paste description → ranked cards w/ working source links, <10s |
| **4. MCP** (½ day) | Both tools live at `/api/mcp` | Claude Code connects to prod URL and gets real matches |
| **5. Evals + polish** (1 day) | Golden set, eval runs, prompt v2/v3, README, PRODUCTIONIZE.md, Loom | Eval table in README; live link; 90-sec Loom recorded |

~5–6 focused days total. Cut line if time-pressed: investor detail page and cron refresh are droppable; **evals and MCP are not** — they're the differentiators.

---

## 7. Explicit Out-of-Scope (say it in the README)

- No auth/accounts — demo tool, one input.
- No LinkedIn/Crunchbase-behind-login/Gmail — ToS-clean public sources only.
- No full investor database — 60 curated investors, depth over breadth.
- No agentic browsing at request time — ingestion is batch; serving is fast and deterministic.

---

## 8. `docs/PRODUCTIONIZE.md` outline (write last, keep to one page)

How this would scale at Metal: queue-based ingestion (Vercel Queues / worker fleet), incremental source refresh with change detection, dedup + entity resolution across sources, eval gates in CI before prompt promotion, per-tenant rate limiting on MCP, caching embeddings at the gateway, human-in-the-loop review queue for low-confidence extractions. One page — enough to show you see the road, not enough to pretend you've driven it.
