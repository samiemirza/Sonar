"""Semantic-ish chunking: ~500 tokens per chunk with ~15% overlap.

Token counts are estimated at ~4 chars/token to avoid a tokenizer dependency;
retrieval quality is not sensitive to exact boundaries.
"""

import re

TARGET_CHARS = 2000  # ~500 tokens
OVERLAP_CHARS = 300  # ~15%
MIN_CHUNK_CHARS = 200

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def _split_long(paragraph: str) -> list[str]:
    if len(paragraph) <= TARGET_CHARS:
        return [paragraph]
    parts, buf = [], ""
    for sentence in _SENTENCE_RE.split(paragraph):
        if buf and len(buf) + len(sentence) > TARGET_CHARS:
            parts.append(buf)
            buf = sentence
        else:
            buf = f"{buf} {sentence}".strip()
    if buf:
        parts.append(buf)
    return parts


def chunk_text(text: str) -> list[tuple[str, int]]:
    """Returns a list of (chunk_text, estimated_token_count)."""
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    pieces = []
    for para in text.split("\n\n"):
        para = para.strip()
        if para:
            pieces.extend(_split_long(para))

    chunks: list[str] = []
    buf = ""
    for piece in pieces:
        if buf and len(buf) + len(piece) + 2 > TARGET_CHARS:
            chunks.append(buf)
            buf = buf[-OVERLAP_CHARS:] + "\n\n" + piece  # carry overlap forward
        else:
            buf = f"{buf}\n\n{piece}".strip()
    if len(buf) >= MIN_CHUNK_CHARS or not chunks:
        chunks.append(buf)

    return [(c, max(1, len(c) // 4)) for c in chunks if c.strip()]
