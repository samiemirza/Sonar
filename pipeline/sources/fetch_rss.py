"""Fetch recent entries from an RSS/Atom feed.

For each entry we prefer the full article page (trafilatura) and fall back to
the feed-provided content, HTML-stripped.
"""

import re
from datetime import UTC, datetime

import feedparser

from sources.fetch_blogs import fetch_article, fetch_html

_TAG_RE = re.compile(r"<[^>]+>")
MIN_TEXT_CHARS = 400


def _strip_html(html: str) -> str:
    text = _TAG_RE.sub(" ", html)
    return re.sub(r"\s{2,}", " ", text).strip()


def _entry_published(entry) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    return datetime(*parsed[:6], tzinfo=UTC)


def _entry_body(entry) -> str | None:
    if entry.get("content"):
        return _strip_html(entry.content[0].value)
    if entry.get("summary"):
        return _strip_html(entry.summary)
    return None


def fetch_feed_entries(feed_url: str, limit: int = 5) -> list[dict]:
    """Returns up to `limit` docs: {url, title, published_at, text}."""
    raw = fetch_html(feed_url)
    if raw is None:
        return []
    parsed = feedparser.parse(raw)

    docs = []
    for entry in parsed.entries[:limit]:
        link = entry.get("link")
        if not link:
            continue
        article = fetch_article(link)
        text = article["text"] if article else _entry_body(entry)
        if not text or len(text) < MIN_TEXT_CHARS:
            continue
        docs.append(
            {
                "url": link,
                "title": entry.get("title") or (article["title"] if article else None),
                "published_at": _entry_published(entry),
                "text": text,
            }
        )
    return docs
