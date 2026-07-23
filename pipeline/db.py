"""Postgres access for the pipeline. Mirrors lib/db/schema.ts."""

import json
import os
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Pipeline shares the app's .env at the repo root.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (expected in repo-root .env)")
    return psycopg.connect(url)


def upsert_investor(conn: psycopg.Connection, inv) -> int:
    row = conn.execute(
        """
        INSERT INTO investors (name, firm, slug, type, stage_focus, site_url)
        VALUES (%s, %s, %s, %s::investor_type, %s, %s)
        ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            firm = EXCLUDED.firm,
            type = EXCLUDED.type,
            stage_focus = EXCLUDED.stage_focus,
            site_url = EXCLUDED.site_url
        RETURNING id
        """,
        (inv.name, inv.firm, inv.slug, inv.type, inv.stage_focus, inv.site_url),
    ).fetchone()
    conn.commit()
    return row[0]


def insert_source(
    conn: psycopg.Connection,
    investor_id: int,
    url: str,
    kind: str,
    title: str | None,
    published_at: datetime | None,
    raw_text: str,
) -> tuple[int, bool]:
    """Returns (source_id, inserted). inserted=False means the URL was already ingested."""
    row = conn.execute(
        """
        INSERT INTO sources (investor_id, url, kind, title, published_at, raw_text)
        VALUES (%s, %s, %s::source_kind, %s, %s, %s)
        ON CONFLICT (url) DO UPDATE SET fetched_at = now()
        RETURNING id, (xmax = 0) AS inserted
        """,
        (investor_id, url, kind, title, published_at, raw_text),
    ).fetchone()
    conn.commit()
    return row[0], row[1]


def insert_chunks(
    conn: psycopg.Connection,
    source_id: int,
    chunks: list[tuple[str, int]],
    embeddings: list[list[float]] | None,
) -> int:
    with conn.cursor() as cur:
        for i, (text, token_count) in enumerate(chunks):
            emb = None
            if embeddings is not None:
                emb = "[" + ",".join(f"{x:.7f}" for x in embeddings[i]) + "]"
            cur.execute(
                """
                INSERT INTO chunks (source_id, text, embedding, token_count)
                VALUES (%s, %s, %s::vector, %s)
                """,
                (source_id, text, emb, token_count),
            )
    conn.commit()
    return len(chunks)


def counts(conn: psycopg.Connection) -> dict:
    out = {}
    for table in ("investors", "sources", "chunks", "theses", "signals"):
        out[table] = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]  # noqa: S608
    out["embedded_chunks"] = conn.execute(
        "SELECT count(*) FROM chunks WHERE embedding IS NOT NULL"
    ).fetchone()[0]
    return out


def investors_with_sources(conn: psycopg.Connection, slug: str | None = None) -> list[dict]:
    """Investors that have at least one ingested source."""
    query = """
        SELECT DISTINCT i.id, i.name, i.firm, i.slug
        FROM investors i JOIN sources s ON s.investor_id = i.id
    """
    params: tuple = ()
    if slug:
        query += " WHERE i.slug = %s"
        params = (slug,)
    rows = conn.execute(query + " ORDER BY i.slug", params).fetchall()
    return [{"id": r[0], "name": r[1], "firm": r[2], "slug": r[3]} for r in rows]


def sources_for_investor(conn: psycopg.Connection, investor_id: int) -> list[dict]:
    """All sources for one investor, newest first, with full text."""
    rows = conn.execute(
        """
        SELECT id, kind, title, url, published_at, raw_text
        FROM sources WHERE investor_id = %s
        ORDER BY published_at DESC NULLS LAST, id DESC
        """,
        (investor_id,),
    ).fetchall()
    return [
        {"id": r[0], "kind": r[1], "title": r[2], "url": r[3], "published_at": r[4], "text": r[5]}
        for r in rows
    ]


def save_extraction(conn: psycopg.Connection, thesis, signals) -> None:
    """Replace an investor's thesis + signals atomically (re-runs are idempotent)."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM theses WHERE investor_id = %s", (thesis.investor_id,))
        cur.execute("DELETE FROM signals WHERE investor_id = %s", (thesis.investor_id,))
        cur.execute(
            """
            INSERT INTO theses
                (investor_id, sectors, stages, themes, check_size, summary,
                 prompt_version, source_ids)
            VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s)
            """,
            (
                thesis.investor_id,
                thesis.sectors,
                thesis.stages,
                json.dumps(
                    [
                        {"theme": t.theme, "evidence": t.evidence, "sourceId": t.source_id}
                        for t in thesis.themes
                    ]
                ),
                thesis.check_size,
                thesis.summary,
                thesis.prompt_version,
                thesis.source_ids,
            ),
        )
        for s in signals:
            cur.execute(
                """
                INSERT INTO signals (investor_id, claim, signal_date, strength, source_id)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (s.investor_id, s.claim, s.signal_date, s.strength, s.source_id),
            )
    conn.commit()
