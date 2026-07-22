"""CLI entrypoint for the offline ingestion pipeline.

Usage:
    uv run pipeline seed                         upsert investors from seed_investors.yaml
    uv run pipeline ingest [--investor SLUG]     fetch + chunk + embed sources
    uv run pipeline stats                        row counts
    uv run pipeline extract [--investor SLUG]    thesis/signal extraction (Phase 2)
"""

import argparse
import sys
from pathlib import Path

import yaml

import db
from extract.chunk import chunk_text
from extract.embed import embed_texts, has_api_key
from models import SeedInvestor
from sources.fetch_blogs import fetch_article
from sources.fetch_rss import fetch_feed_entries
from sources.fetch_transcripts import fetch_transcript

SEED_PATH = Path(__file__).resolve().parent / "sources" / "seed_investors.yaml"


def load_seed() -> list[SeedInvestor]:
    raw = yaml.safe_load(SEED_PATH.read_text())
    return [SeedInvestor.model_validate(item) for item in raw]


def cmd_seed() -> int:
    investors = load_seed()
    conn = db.connect()
    for inv in investors:
        db.upsert_investor(conn, inv)
    print(f"seeded {len(investors)} investors")
    return 0


def _docs_for_source(src, max_entries: int) -> list[dict]:
    if src.kind == "rss":
        return fetch_feed_entries(src.url, limit=max_entries)
    if src.kind in ("blog", "x_post"):
        doc = fetch_article(src.url)
        return [doc] if doc else []
    if src.kind == "transcript":
        doc = fetch_transcript(src.url)
        return [doc] if doc else []
    return []


def cmd_ingest(investor_slug: str | None, max_entries: int, skip_embed: bool) -> int:
    investors = load_seed()
    if investor_slug:
        investors = [i for i in investors if i.slug == investor_slug]
        if not investors:
            print(f"no investor with slug {investor_slug!r} in seed file", file=sys.stderr)
            return 1

    embed_enabled = not skip_embed and has_api_key()
    if not embed_enabled and not skip_embed:
        print("WARNING: OPENAI_API_KEY not set — ingesting without embeddings", file=sys.stderr)

    conn = db.connect()
    new_sources = new_chunks = failures = 0
    for inv in investors:
        investor_id = db.upsert_investor(conn, inv)
        for src in inv.sources:
            try:
                docs = _docs_for_source(src, max_entries)
            except Exception as e:  # noqa: BLE001 — one bad feed must not kill the run
                print(f"  ! {inv.slug} {src.url}: {e}", file=sys.stderr)
                failures += 1
                continue
            if not docs:
                print(f"  ! {inv.slug} {src.url}: no usable documents", file=sys.stderr)
                failures += 1
                continue
            for doc in docs:
                # rss feed entries are stored per-article; kind follows the seed entry
                source_id, inserted = db.insert_source(
                    conn,
                    investor_id,
                    doc["url"],
                    src.kind,
                    doc.get("title"),
                    doc.get("published_at"),
                    doc["text"],
                )
                if not inserted:
                    continue  # already ingested this URL
                chunks = chunk_text(doc["text"])
                embeddings = embed_texts([c[0] for c in chunks]) if embed_enabled else None
                db.insert_chunks(conn, source_id, chunks, embeddings)
                new_sources += 1
                new_chunks += len(chunks)
        print(f"  {inv.slug}: done")

    print(f"\ningested {new_sources} new sources, {new_chunks} chunks, {failures} failed source URLs")
    print(f"totals: {db.counts(conn)}")
    return 0


def cmd_embed(batch: int = 500) -> int:
    """Backfill embeddings for chunks ingested without them."""
    if not has_api_key():
        print("OPENAI_API_KEY not set", file=sys.stderr)
        return 1
    conn = db.connect()
    total = 0
    while True:
        rows = conn.execute(
            "SELECT id, text FROM chunks WHERE embedding IS NULL ORDER BY id LIMIT %s", (batch,)
        ).fetchall()
        if not rows:
            break
        embeddings = embed_texts([r[1] for r in rows])
        with conn.cursor() as cur:
            for (chunk_id, _), emb in zip(rows, embeddings, strict=True):
                vec = "[" + ",".join(f"{x:.7f}" for x in emb) + "]"
                cur.execute("UPDATE chunks SET embedding = %s::vector WHERE id = %s", (vec, chunk_id))
        conn.commit()
        total += len(rows)
        print(f"  embedded {total} chunks...")
    print(f"backfilled {total} embeddings")
    return 0


def cmd_stats() -> int:
    print(db.counts(db.connect()))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("seed", help="upsert investors from seed_investors.yaml")
    sub.add_parser("stats", help="row counts")
    sub.add_parser("embed", help="backfill embeddings for chunks missing them")

    ingest = sub.add_parser("ingest", help="fetch, chunk, and embed sources")
    ingest.add_argument("--investor", help="limit to one investor slug")
    ingest.add_argument("--max-entries", type=int, default=5, help="max entries per RSS feed")
    ingest.add_argument("--skip-embed", action="store_true", help="skip embedding generation")

    extract = sub.add_parser("extract", help="extract theses and signals")
    extract.add_argument("--investor", help="limit to one investor slug")

    args = parser.parse_args()

    if args.command == "seed":
        return cmd_seed()
    if args.command == "ingest":
        return cmd_ingest(args.investor, args.max_entries, args.skip_embed)
    if args.command == "stats":
        return cmd_stats()
    if args.command == "embed":
        return cmd_embed()

    # extract lands in Phase 2.
    print(f"pipeline {args.command}: not implemented yet", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
