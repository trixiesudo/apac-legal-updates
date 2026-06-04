from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import feedparser
import httpx
from bs4 import BeautifulSoup

from .config import LEGAL_AI_NEWS_SOURCES, LegalAiNewsSource, settings
from .database import record_source_run, upsert_legal_ai_updates
from .fetcher import (
    canonicalize_url,
    clean_text,
    feed_date,
    has_term,
    normalize_for_fingerprint,
    parse_publication_date,
)


LEGAL_AI_KEYWORDS = (
    "ai",
    "artificial intelligence",
    "automation",
    "chatgpt",
    "copilot",
    "generative ai",
    "genai",
    "hallucination",
    "legal ai",
    "legal tech",
    "legal technology",
    "law firm",
    "law firms",
    "lawyer",
    "lawyers",
    "llm",
    "machine learning",
    "regulation",
    "governance",
)

LEGAL_AI_FOCUSED_SOURCES = {
    "ai_artificial_lawyer",
    "ai_lawsites",
    "ai_legaltech_news",
    "ai_aba_legal_technology",
}

LEGAL_AI_RSS_FEEDS = {
    "ai_artificial_lawyer": "https://www.artificiallawyer.com/feed/",
    "ai_lawsites": "https://www.lawnext.com/feed/",
}


def make_legal_ai_fingerprint(source: LegalAiNewsSource, title: str, link: str) -> str:
    normalized = normalize_for_fingerprint(title)
    fallback = canonicalize_url(link) if link else normalized
    payload = f"{source.content_group}|{source.id}|{normalized or fallback}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def is_legal_ai_relevant(source: LegalAiNewsSource, title: str, summary: str) -> bool:
    if source.id in LEGAL_AI_FOCUSED_SOURCES:
        return True
    text = clean_text(f"{title} {summary}").lower()
    return any(has_term(text, keyword) for keyword in LEGAL_AI_KEYWORDS)


def to_legal_ai_item(
    source: LegalAiNewsSource,
    title: str,
    summary: str,
    date: str | None,
    link: str,
) -> dict[str, Any] | None:
    title = clean_text(title, 260)
    summary = clean_text(summary, 520)
    if len(title) < 8:
        return None
    if not is_legal_ai_relevant(source, title, summary):
        return None
    link = canonicalize_url(link or source.url)
    return {
        "source_id": source.id,
        "source": source.name,
        "region": source.region,
        "source_type": source.source_type,
        "category": source.category,
        "tags": list(source.tags),
        "title": title,
        "summary": summary,
        "date": date,
        "link": link,
        "fingerprint": make_legal_ai_fingerprint(source, title, link),
    }


async def fetch_legal_ai_rss(client: httpx.AsyncClient, source: LegalAiNewsSource) -> list[dict[str, Any]]:
    response = await client.get(LEGAL_AI_RSS_FEEDS.get(source.id, source.url))
    response.raise_for_status()
    feed = feedparser.parse(response.content)
    items: list[dict[str, Any]] = []
    for entry in feed.entries[: settings.source_limit_per_run]:
        item = to_legal_ai_item(
            source,
            getattr(entry, "title", ""),
            getattr(entry, "summary", "") or getattr(entry, "description", ""),
            feed_date(entry),
            getattr(entry, "link", "") or source.url,
        )
        if item:
            items.append(item)
    return items


def legal_ai_nodes(soup: BeautifulSoup) -> list[Any]:
    nodes = soup.select(
        "article, .post, .entry, .card, .views-row, .teaser, .story, .article-card, li"
    )
    if nodes:
        return nodes
    return soup.select("a[href]")


def same_site_link(anchor: Any, source: LegalAiNewsSource) -> bool:
    href = anchor.get("href") or ""
    resolved = urljoin(source.url, href)
    source_host = urlparse(source.url).netloc.lower().removeprefix("www.")
    target_host = urlparse(resolved).netloc.lower().removeprefix("www.")
    return bool(target_host) and target_host == source_host


def preferred_anchor(node: Any, source: LegalAiNewsSource) -> Any | None:
    anchors = [
        anchor
        for anchor in node.select("a[href]")
        if clean_text(anchor.get_text(" "))
    ]
    if anchors:
        internal = [anchor for anchor in anchors if same_site_link(anchor, source)]
        candidates = internal or anchors
        headline_like = [
            anchor
            for anchor in candidates
            if len(clean_text(anchor.get_text(" "))) >= 18
            and clean_text(anchor.get_text(" ")).lower() not in {"read more", "learn more", "view more"}
        ]
        return (headline_like or candidates)[0]
    if getattr(node, "name", "") == "a" and node.get("href"):
        return node
    return None


def node_link(node: Any, source: LegalAiNewsSource) -> str:
    anchor = preferred_anchor(node, source)
    if anchor:
        return urljoin(source.url, anchor.get("href") or "")
    return source.url


def node_title(node: Any, source: LegalAiNewsSource) -> str:
    for selector in ("h1", "h2", "h3", "h4", ".title", ".headline", "[class*=title]", "[class*=headline]"):
        selected = node.select_one(selector)
        if selected:
            text = clean_text(selected.get_text(" "))
            if len(text) >= 8:
                return text
    link = preferred_anchor(node, source)
    if link:
        text = clean_text(link.get_text(" "))
        if len(text) >= 8:
            return text
    return clean_text(node.get_text(" "), 220)


def node_summary(node: Any, title: str) -> str:
    for selector in ("p", ".summary", ".excerpt", ".description", "[class*=summary]", "[class*=excerpt]"):
        selected = node.select_one(selector)
        if selected:
            text = clean_text(selected.get_text(" "), 520)
            if text and text != title:
                return text
    text = clean_text(node.get_text(" "), 520)
    if text.lower().startswith(title.lower()):
        return clean_text(text[len(title) :], 520)
    return text if text != title else ""


def node_date(node: Any) -> str | None:
    time_node = node.select_one("time[datetime]")
    if time_node:
        return parse_publication_date(time_node.get("datetime"))
    time_text = node.select_one("time")
    if time_text:
        return parse_publication_date(time_text.get_text(" "))
    return parse_publication_date(node.get_text(" "))


async def fetch_legal_ai_html(client: httpx.AsyncClient, source: LegalAiNewsSource) -> list[dict[str, Any]]:
    response = await client.get(source.url)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")
    for tag in soup.select("script, style, noscript, svg, nav, footer, header, form"):
        tag.decompose()
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in legal_ai_nodes(soup):
        if len(items) >= settings.source_limit_per_run:
            break
        title = node_title(node, source)
        key = normalize_for_fingerprint(title)
        if not key or key in seen:
            continue
        seen.add(key)
        item = to_legal_ai_item(source, title, node_summary(node, title), node_date(node), node_link(node, source))
        if item:
            items.append(item)
    return items


async def fetch_legal_ai_source(
    client: httpx.AsyncClient,
    source: LegalAiNewsSource,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if source.ingestion_method in {"manual", "pending", "api"}:
        run = record_source_run(source.id, source.name, source.region, "idle", 0)
        return [], run
    try:
        if source.ingestion_method == "rss":
            items = await fetch_legal_ai_rss(client, source)
        else:
            items = await fetch_legal_ai_html(client, source)
        run = record_source_run(source.id, source.name, source.region, "ok", len(items))
        return items, run
    except Exception as exc:
        run = record_source_run(source.id, source.name, source.region, "error", 0, str(exc))
        return [], run


async def refresh_legal_ai_sources() -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    fetchable = [source for source in LEGAL_AI_NEWS_SOURCES if source.ingestion_method in {"rss", "scraper"}]
    headers = {"User-Agent": settings.user_agent, "Accept": "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8"}
    timeout = httpx.Timeout(settings.source_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True, trust_env=False) as client:
        results = await asyncio.gather(*(fetch_legal_ai_source(client, source) for source in fetchable))
    runs = [run for _, run in results]
    items = [item for source_items, _ in results for item in source_items]
    unique: dict[str, dict[str, Any]] = {}
    for item in items:
        unique[item["fingerprint"]] = item
    inserted, updated = upsert_legal_ai_updates(list(unique.values()))
    finished_at = datetime.now(timezone.utc)
    return {
        "started_at": started_at,
        "finished_at": finished_at,
        "sources_checked": len(fetchable),
        "items_seen": len(items),
        "inserted": inserted,
        "updated": updated,
        "failed_sources": sum(1 for run in runs if run["status"] == "error"),
        "runs": runs,
    }
