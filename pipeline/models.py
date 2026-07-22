"""Pydantic models mirroring the Drizzle schema in lib/db/schema.ts.

The provenance rule is enforced here too: no thesis field and no signal
exists without a source_id.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

InvestorType = Literal["fund", "angel"]
SourceKind = Literal["blog", "rss", "transcript", "x_post"]


class SeedSource(BaseModel):
    url: str
    kind: SourceKind


class SeedInvestor(BaseModel):
    """One entry in sources/seed_investors.yaml."""

    name: str
    firm: str | None = None
    slug: str
    type: InvestorType = "fund"
    stage_focus: list[str] = Field(default_factory=list)
    site_url: str | None = None
    sources: list[SeedSource] = Field(default_factory=list)


class Source(BaseModel):
    id: int | None = None
    investor_id: int
    url: str
    kind: SourceKind
    title: str | None = None
    published_at: datetime | None = None
    raw_text: str


class Chunk(BaseModel):
    id: int | None = None
    source_id: int
    text: str
    embedding: list[float] | None = None
    token_count: int


class ThesisTheme(BaseModel):
    theme: str
    evidence: str
    source_id: int


class Thesis(BaseModel):
    investor_id: int
    sectors: list[str]
    stages: list[str]
    themes: list[ThesisTheme]
    check_size: str | None = None
    summary: str
    prompt_version: str
    source_ids: list[int] = Field(min_length=1)


class Signal(BaseModel):
    investor_id: int
    claim: str
    signal_date: datetime
    strength: int = Field(ge=1, le=5)
    source_id: int
