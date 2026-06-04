from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class UpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    country: str
    source: str
    source_tab: str | None = None
    title: str
    summary: str
    date: str | None
    link: str
    category: str
    first_seen_at: str
    last_seen_at: str
    is_new: bool = False


class SourceOut(BaseModel):
    id: str
    country: str
    name: str
    url: str
    source_type: str
    category: str
    source_tab: str | None = None
    official: bool
    access_basis: str


class LegalAiSourceOut(BaseModel):
    id: str
    name: str
    url: str
    category: str
    source_type: str
    region: str
    tags: list[str]
    ingestion_method: str
    notes: str
    content_group: str


class LegalAiUpdateOut(BaseModel):
    id: int
    source_id: str
    source: str
    region: str
    source_type: str
    category: str
    tags: list[str]
    title: str
    summary: str = ""
    date: str | None = None
    link: str
    first_seen_at: str
    last_seen_at: str
    is_new: bool = False


class NewsletterOut(BaseModel):
    id: int
    title: str
    summary: str = ""
    html_body: str = ""
    text_body: str = ""
    status: str
    published_at: str | None = None
    created_at: str
    updated_at: str


class PublishNewsletterRequest(BaseModel):
    title: str
    summary: str = ""
    html_body: str = ""
    text_body: str = ""
    status: str = "published"
    published_at: str | None = None


class WeeklyDigestOut(BaseModel):
    id: int
    digest_id: str
    title: str
    summary: str = ""
    html_body: str = ""
    text_body: str = ""
    status: str
    published_at: str | None = None
    created_at: str
    updated_at: str
    item_count: int = 0
    department: str = ""
    digest_type: str = ""
    entries: list[dict] = Field(default_factory=list)


class PublishWeeklyDigestRequest(BaseModel):
    digest_id: str
    title: str
    summary: str = ""
    html_body: str = ""
    text_body: str = ""
    status: str = "published"
    published_at: str | None = None
    item_count: int = 0
    department: str = ""
    digest_type: str = ""
    entries: list[dict] = Field(default_factory=list)


class SourceRunOut(BaseModel):
    source_id: str
    source: str
    country: str
    status: str
    fetched_at: str
    item_count: int
    error: str | None = None


class DraftUpdateIn(BaseModel):
    country: str = ""
    source: str = ""
    source_tab: str | None = None
    title: str
    summary: str = ""
    date: str | None = None
    link: str
    category: str = "Legal News"


class DraftEmailRequest(BaseModel):
    updates: list[DraftUpdateIn] = Field(default_factory=list, min_length=1, max_length=100)


class DraftEmailResult(BaseModel):
    status: str
    item_count: int
    subject: str


class DigestSourceSummaryItem(BaseModel):
    item_id: str
    title: str = ""
    summary: str = ""
    link: str
    source: str = ""
    jurisdiction: str = ""
    category: str = ""


class DigestSourceSummaryRequest(BaseModel):
    items: list[DigestSourceSummaryItem] = Field(default_factory=list, min_length=1, max_length=12)


class DigestSourceSummaryResult(BaseModel):
    item_id: str
    title: str
    link: str
    status: str
    summary: str = ""
    error: str | None = None


class RefreshResult(BaseModel):
    started_at: datetime
    finished_at: datetime
    sources_checked: int
    items_seen: int
    inserted: int
    updated: int
    failed_sources: int
    runs: list[SourceRunOut] = Field(default_factory=list)
