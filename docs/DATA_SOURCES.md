# Data Sources

Every source ingested by the pipeline is **public**: no login walls, no paywalled bodies, no
platform APIs that require the author's account. The full list lives in
[`pipeline/sources/seed_investors.yaml`](../pipeline/sources/seed_investors.yaml).

## Source kinds

| kind | What it is | How it's fetched |
|---|---|---|
| `rss` | Public RSS/Atom feed of an investor's blog or newsletter | Feed parsed with `feedparser`; each entry's article page fetched and cleaned with `trafilatura` (fallback: feed-provided body) |
| `blog` | A single public essay/report page | Fetched with `httpx`, extracted with `trafilatura` |
| `transcript` | Public YouTube video captions | `youtube-transcript-api` (uses YouTube's public caption endpoint) |

## Selection criteria

- The author is an active startup investor (fund partner or angel) writing about what they invest in.
- The feed/page is the investor's own publication — we ingest their words, not third-party coverage.
- Mostly-paywalled newsletters are included only via their public/free posts (whatever the public feed exposes).

## ToS notes

- We identify ourselves with a custom User-Agent (`SonarBot`) and fetch each URL at most once
  (dedup on URL; re-runs skip already-ingested sources).
- Batch ingestion is manual/cron-light — a few hundred requests per full run across ~100 hosts,
  far below any rate-limiting threshold.
- Raw text is stored solely to power retrieval + extraction with citation links back to the
  original URL; the product surface always links to the source rather than republishing it.
- Explicitly excluded: LinkedIn, Crunchbase-behind-login, private communities, and anything
  requiring authentication (see PLAN.md §7).
