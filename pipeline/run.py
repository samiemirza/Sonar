"""CLI entrypoint for the offline ingestion pipeline.

Usage:
    uv run pipeline ingest [--investor SLUG]     fetch + chunk + embed sources
    uv run pipeline extract [--investor SLUG]    thesis/signal extraction
    uv run pipeline seed                         upsert investors from seed_investors.yaml
"""

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(prog="pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    seed = sub.add_parser("seed", help="upsert investors from seed_investors.yaml")

    ingest = sub.add_parser("ingest", help="fetch, chunk, and embed sources")
    ingest.add_argument("--investor", help="limit to one investor slug")

    extract = sub.add_parser("extract", help="extract theses and signals")
    extract.add_argument("--investor", help="limit to one investor slug")

    args = parser.parse_args()

    # Wired up in Phase 1 (ingest) and Phase 2 (extract).
    print(f"pipeline {args.command}: not implemented yet", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
