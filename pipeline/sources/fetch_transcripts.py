"""Fetch YouTube captions as transcript text."""

import re

from youtube_transcript_api import YouTubeTranscriptApi

_VIDEO_ID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]{11})")


def video_id_from_url(url: str) -> str | None:
    m = _VIDEO_ID_RE.search(url)
    return m.group(1) if m else None


def fetch_transcript(url: str) -> dict | None:
    """Returns {url, title, text} or None if no transcript is available."""
    vid = video_id_from_url(url)
    if not vid:
        return None
    try:
        fetched = YouTubeTranscriptApi().fetch(vid)
    except Exception:
        return None
    text = " ".join(snippet.text for snippet in fetched)
    if len(text) < 400:
        return None
    return {"url": url, "title": f"YouTube transcript ({vid})", "text": text}
