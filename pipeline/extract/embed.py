"""Batch embeddings via OpenAI. 1024 dims to match the pgvector column."""

import os

from openai import OpenAI

MODEL = "text-embedding-3-small"
DIMENSIONS = 1024
BATCH_SIZE = 100
MAX_CHARS = 30000  # stay under the 8k-token per-input limit


def has_api_key() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def embed_texts(texts: list[str]) -> list[list[float]]:
    client = OpenAI()
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = [t[:MAX_CHARS] for t in texts[i : i + BATCH_SIZE]]
        resp = client.embeddings.create(model=MODEL, input=batch, dimensions=DIMENSIONS)
        out.extend(d.embedding for d in resp.data)
    return out
