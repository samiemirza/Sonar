"""Fetch recent entries from an RSS/Atom feed.

For each entry we prefer the full article page (trafilatura) and fall back to
the feed-provided content, HTML-stripped.
"""

import re
from datetime import UTC, datetime
from urllib.parse import urljoin, urlparse

import feedparser

from sources.fetch_blogs import fetch_article, fetch_html

_TAG_RE = re.compile(r"<[^>]+>")
_FEED_LINK_RE = re.compile(
    r"<link[^>]+type=[\"']application/(?:rss|atom)\+xml[\"'][^>]*>", re.IGNORECASE
)
_HREF_RE = re.compile(r"href=[\"']([^\"']+)[\"']", re.IGNORECASE)
MIN_TEXT_CHARS = 400
FALLBACK_FEED_PATHS = ["/feed", "/feed/", "/rss/", "/feed.xml", "/rss.xml", "/index.xml", "/atom.xml"]


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


def _discover_feed(page_url: str, html: str):
    """Given an HTML page where a feed was expected, find the real feed."""
    candidates = []
    for tag in _FEED_LINK_RE.findall(html):
        href = _HREF_RE.search(tag)
        if href:
            candidates.append(urljoin(page_url, href.group(1)))
    root = f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"
    candidates.extend(root + p for p in FALLBACK_FEED_PATHS)

    seen = set()
    for candidate in candidates:
        if candidate in seen or candidate == page_url:
            continue
        seen.add(candidate)
        raw = fetch_html(candidate)
        if raw is None:
            continue
        parsed = feedparser.parse(raw)
        if parsed.entries:
            return parsed
    return None


def fetch_feed_entries(feed_url: str, limit: int = 5) -> list[dict]:
    """Returns up to `limit` docs: {url, title, published_at, text}."""
    raw = fetch_html(feed_url)
    if raw is None:
        # Feed URL is dead (404 etc.) — try autodiscovery from the site homepage.
        root = f"{urlparse(feed_url).scheme}://{urlparse(feed_url).netloc}/"
        home = fetch_html(root)
        parsed = _discover_feed(root, home) if home else None
        if parsed is None:
            return []
    else:
        parsed = feedparser.parse(raw)
        if not parsed.entries:
            # URL served HTML (site rebuilt, feed moved) — autodiscover the real feed.
            parsed = _discover_feed(feed_url, raw)
            if parsed is None:
                return []

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
