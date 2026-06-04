from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import COUNTRIES, LEGAL_AI_NEWS_SOURCES, PRIMARY_CATEGORIES, SOURCES, settings
from .database import get_stats, init_db, list_legal_ai_updates, list_published_newsletters, list_published_weekly_digests, list_updates, upsert_newsletter, upsert_weekly_digest
from .email_draft import build_dashboard_email_html, build_email_subject, open_outlook_draft
from .legal_ai_fetcher import refresh_legal_ai_sources
from .models import DigestSourceSummaryRequest, DigestSourceSummaryResult, DraftEmailRequest, DraftEmailResult, LegalAiSourceOut, LegalAiUpdateOut, NewsletterOut, PublishNewsletterRequest, PublishWeeklyDigestRequest, RefreshResult, SourceOut, UpdateOut, WeeklyDigestOut
from .risk_heatmap import build_risk_heatmap
from .scheduler import daily_scheduler, refresh_once
from .source_summary import summarize_digest_sources


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    stop_event = asyncio.Event()
    scheduler_task: asyncio.Task | None = None
    if settings.enable_scheduler:
        scheduler_task = asyncio.create_task(daily_scheduler(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        if scheduler_task:
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="APAC Legal Updates API",
    version="0.1.0",
    description="Daily legal news and judiciary update radar for Malaysia, Singapore, Hong Kong, Australia, New Zealand, and India.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=r"^(http://localhost:\d+|http://127\.0\.0\.1:\d+|chrome-extension://.*)$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def access_basis(source) -> str:
    if source.source_type == "rss":
        return "Publisher RSS feed"
    if source.official:
        return "Official public source"
    return "Public access listing page"


def is_public_mode() -> bool:
    return bool(getattr(settings, "public_mode", False))


def block_public_raw_access() -> None:
    if is_public_mode():
        raise HTTPException(status_code=404, detail="This endpoint is not available on the public website.")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "scheduler_enabled": settings.enable_scheduler,
        "daily_run_hour": settings.daily_run_hour,
    }


@app.get("/api/updates", response_model=list[UpdateOut])
def updates(
    country: str | None = Query(default=None),
    category: str | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    block_public_raw_access()
    return list_updates(country=country, category=category, q=q, limit=limit, offset=offset)


@app.get("/api/sources", response_model=list[SourceOut])
def sources() -> list[dict]:
    block_public_raw_access()
    return [
        {
            "id": source.id,
            "country": source.country,
            "name": source.name,
            "url": source.url,
            "source_type": source.source_type,
            "category": source.category,
            "source_tab": source.source_tab,
            "official": source.official,
            "access_basis": access_basis(source),
        }
        for source in SOURCES
    ]


@app.get("/api/legal-ai/sources", response_model=list[LegalAiSourceOut])
def legal_ai_sources() -> list[dict]:
    block_public_raw_access()
    return [
        {
            "id": source.id,
            "name": source.name,
            "url": source.url,
            "category": source.category,
            "source_type": source.source_type,
            "region": source.region,
            "tags": list(source.tags),
            "ingestion_method": source.ingestion_method,
            "notes": source.notes,
            "content_group": source.content_group,
        }
        for source in LEGAL_AI_NEWS_SOURCES
    ]


@app.get("/api/legal-ai/updates", response_model=list[LegalAiUpdateOut])
def legal_ai_updates(
    region: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    topic: str | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=80, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    block_public_raw_access()
    return list_legal_ai_updates(region=region, source_type=source_type, topic=topic, q=q, limit=limit, offset=offset)


@app.post("/api/legal-ai/refresh", response_model=RefreshResult)
async def refresh_legal_ai() -> dict:
    block_public_raw_access()
    return await refresh_legal_ai_sources()


@app.get("/api/newsletters", response_model=list[NewsletterOut])
def newsletters(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return list_published_newsletters(limit=limit, offset=offset)


@app.post("/api/admin/newsletters/publish", response_model=NewsletterOut)
def publish_newsletter(payload: PublishNewsletterRequest) -> dict:
    block_public_raw_access()
    return upsert_newsletter(payload.model_dump())


@app.get("/api/weekly-digests", response_model=list[WeeklyDigestOut])
def weekly_digests(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return list_published_weekly_digests(limit=limit, offset=offset)


@app.post("/api/admin/weekly-digests/publish", response_model=WeeklyDigestOut)
def publish_weekly_digest(payload: PublishWeeklyDigestRequest) -> dict:
    return upsert_weekly_digest(payload.model_dump())


@app.get("/api/stats")
def stats() -> dict:
    if is_public_mode():
        newsletters = list_published_newsletters(limit=100)
        return {
            "total": len(newsletters),
            "new_24h": 0,
            "by_country": {},
            "by_category": {"Published Newsletters": len(newsletters)},
            "last_scan_at": newsletters[0]["published_at"] if newsletters else None,
            "source_runs": [],
            "countries": COUNTRIES,
            "categories": ["Published Newsletters"],
            "source_count": 0,
            "public_mode": True,
        }
    data = get_stats()
    active_source_ids = {source.id for source in SOURCES}
    data["source_runs"] = [
        run for run in data["source_runs"] if run["source_id"] in active_source_ids
    ]
    return data | {
        "countries": COUNTRIES,
        "categories": PRIMARY_CATEGORIES,
        "source_count": len(SOURCES),
    }


@app.get("/api/risk-heatmap")
def risk_heatmap() -> dict:
    block_public_raw_access()
    updates_by_id: dict[int, dict] = {}
    for country in COUNTRIES:
        offset = 0
        while True:
            page = list_updates(country=country, limit=200, offset=offset)
            for update in page:
                updates_by_id[update["id"]] = update
            if len(page) < 200:
                break
            offset += 200
    return build_risk_heatmap(list(updates_by_id.values()))


@app.post("/api/draft-email", response_model=DraftEmailResult)
async def draft_email(payload: DraftEmailRequest) -> dict:
    block_public_raw_access()
    subject = build_email_subject()
    html_body = build_dashboard_email_html(payload.updates)
    try:
        result = await asyncio.to_thread(open_outlook_draft, subject, html_body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "status": result["status"],
        "item_count": len(payload.updates),
        "subject": subject,
    }


@app.post("/api/digest/source-summaries", response_model=list[DigestSourceSummaryResult])
async def digest_source_summaries(payload: DigestSourceSummaryRequest) -> list[dict]:
    block_public_raw_access()
    return await summarize_digest_sources([item.model_dump() for item in payload.items])


@app.post("/api/refresh", response_model=RefreshResult)
async def refresh() -> dict:
    block_public_raw_access()
    return await refresh_once()
