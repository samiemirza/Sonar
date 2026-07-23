"""Structured thesis + signal extraction (Phase 2).

One OpenAI structured-outputs call per investor over their ingested sources.
The model must cite a [SOURCE <id>] for every theme and signal; anything
citing an id we didn't feed it is dropped here — provenance is enforced in
code, not trusted from the model.
"""

import os
import sys
from datetime import UTC, date, datetime

from openai import OpenAI
from pydantic import BaseModel

from extract.prompts import THESIS_PROMPT_VERSION, THESIS_SYSTEM_PROMPT, thesis_user_prompt
from models import Signal, Thesis, ThesisTheme

MODEL = os.environ.get("EXTRACT_MODEL", "gpt-5-mini")
MAX_SOURCE_CHARS = 8000
MAX_CORPUS_CHARS = 60000


# Mirror of models.Thesis/Signal, but constraint-free: OpenAI strict structured
# outputs reject numeric bounds, so strength/dates are validated after parsing.
class ExtractedTheme(BaseModel):
    theme: str
    evidence: str
    source_id: int


class ExtractedSignal(BaseModel):
    claim: str
    signal_date: str  # YYYY-MM-DD
    strength: int  # 1-5, clamped in code
    source_id: int


class ExtractionResult(BaseModel):
    sectors: list[str]
    stages: list[str]
    themes: list[ExtractedTheme]
    check_size: str | None
    summary: str
    signals: list[ExtractedSignal]


ALLOWED_STAGES = {"pre-seed", "seed", "series-a", "series-b", "growth"}


def build_corpus(sources: list[dict]) -> str:
    """sources: [{id, kind, title, url, published_at, text}] — newest first."""
    blocks: list[str] = []
    total = 0
    for src in sources:
        published = src["published_at"].date().isoformat() if src["published_at"] else "unknown"
        header = (
            f"[SOURCE {src['id']}] kind={src['kind']} | title={src['title'] or 'untitled'} | "
            f"url={src['url']} | published={published}"
        )
        body = src["text"][:MAX_SOURCE_CHARS]
        block = f"{header}\n{body}"
        if total + len(block) > MAX_CORPUS_CHARS and blocks:
            break
        blocks.append(block)
        total += len(block)
    return "\n\n---\n\n".join(blocks)


def _parse_date(raw: str, fallback: datetime | None) -> datetime | None:
    try:
        return datetime.combine(date.fromisoformat(raw.strip()), datetime.min.time(), tzinfo=UTC)
    except ValueError:
        return fallback


def extract_investor(
    client: OpenAI,
    investor_id: int,
    investor_name: str,
    firm: str | None,
    sources: list[dict],
) -> tuple[Thesis, list[Signal]] | None:
    """Returns validated (thesis, signals), or None if extraction is unusable."""
    corpus = build_corpus(sources)
    if not corpus.strip():
        return None

    completion = client.chat.completions.parse(
        model=MODEL,
        reasoning_effort="low",
        messages=[
            {"role": "system", "content": THESIS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": thesis_user_prompt(
                    investor_name, firm, datetime.now(UTC).date().isoformat(), corpus
                ),
            },
        ],
        response_format=ExtractionResult,
    )
    result = completion.choices[0].message.parsed
    if result is None or not result.summary.strip():
        return None

    fed = {src["id"]: src for src in sources}

    themes: list[ThesisTheme] = []
    for t in result.themes:
        if t.source_id not in fed:
            print(f"    ! dropped theme citing unknown source {t.source_id}", file=sys.stderr)
            continue
        themes.append(ThesisTheme(theme=t.theme.strip(), evidence=t.evidence.strip(),
                                  source_id=t.source_id))

    signals: list[Signal] = []
    for s in result.signals:
        if s.source_id not in fed:
            print(f"    ! dropped signal citing unknown source {s.source_id}", file=sys.stderr)
            continue
        when = _parse_date(s.signal_date, fed[s.source_id]["published_at"])
        if when is None:
            print(f"    ! dropped undatable signal: {s.claim[:60]}", file=sys.stderr)
            continue
        signals.append(
            Signal(
                investor_id=investor_id,
                claim=s.claim.strip(),
                signal_date=when,
                strength=min(5, max(1, s.strength)),
                source_id=s.source_id,
            )
        )

    # Thesis provenance = the union of sources its themes and signals cite.
    cited = sorted({t.source_id for t in themes} | {s.source_id for s in signals})
    if not cited:
        return None

    thesis = Thesis(
        investor_id=investor_id,
        sectors=[s.strip().lower() for s in result.sectors if s.strip()],
        stages=[s for s in (st.strip().lower() for st in result.stages) if s in ALLOWED_STAGES],
        themes=themes,
        check_size=result.check_size,
        summary=result.summary.strip(),
        prompt_version=THESIS_PROMPT_VERSION,
        source_ids=cited,
    )
    return thesis, signals
