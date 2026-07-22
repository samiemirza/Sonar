"""Fetch a single web page and extract clean article text."""

import httpx
import trafilatura

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
}
TIMEOUT = 20.0


def fetch_html(url: str) -> str | None:
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
        resp.raise_for_status()
        return resp.text
    except httpx.HTTPError:
        return None


def fetch_article(url: str) -> dict | None:
    """Returns {url, title, text} or None if the page yields no usable text."""
    html = fetch_html(url)
    if not html:
        return None
    text = trafilatura.extract(html, include_comments=False)
    if not text or len(text) < 400:
        return None
    meta = trafilatura.extract_metadata(html)
    return {"url": url, "title": meta.title if meta else None, "text": text}
