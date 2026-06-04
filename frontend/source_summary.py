from __future__ import annotations

import asyncio
import ipaddress
import re
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from .config import settings
from .fetcher import BROWSER_COMPATIBLE_USER_AGENT, clean_text


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OLLAMA_GENERATE_PATH = "/api/generate"
MAX_SOURCE_CONTENT_CHARS = 12000
MAX_AI_SUMMARY_CHARS = 700

SUMMARY_HEADERS = {
    "User-Agent": BROWSER_COMPATIBLE_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

BLOCKED_HOSTS = {"localhost", "0.0.0.0"}


def is_allowed_source_url(value: str) -> bool:
    parsed = urlparse(value or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    host = (parsed.hostname or "").lower()
    if host in BLOCKED_HOSTS or host.endswith(".local"):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast)


def sentence_trim(value: str, max_length: int = 520) -> str:
    text = clean_text(value)
    if len(text) <= max_length:
        return text
    clipped = text[:max_length].rsplit(" ", 1)[0].rstrip(" .,;:")
    return f"{clipped}..."


AI_SUMMARY_PREAMBLE_RE = re.compile(
    r"^\s*(?:"
    r"(?:here\s+(?:are|is)\s+(?:two|2)\s+concise\s+factual\s+sentences\s+summarizing\s+the\s+changes)"
    r"|(?:here\s+(?:are|is)\s+(?:two|2)\s+concise\s+sentences)"
    r"|(?:here\s+(?:are|is)\s+a\s+concise\s+summary(?:\s+of\s+the\s+legal\s+update)?)"
    r"|(?:(?:local\s+)?ai\s+summary)"
    r"|(?:openai\s+summary)"
    r")\s*:\s*",
    re.I,
)


def clean_ai_summary_output(value: str) -> str:
    text = str(value or "").strip()
    for _ in range(3):
        cleaned = AI_SUMMARY_PREAMBLE_RE.sub("", text).strip()
        if cleaned == text:
            break
        text = cleaned

    lines: list[str] = []
    for line in text.splitlines():
        line = clean_text(line)
        if not line:
            continue
        line = re.sub(r"^\s*(?:[-*]\s+|\d+[.)]\s+)", "", line).strip()
        line = re.sub(r"\s+(?:[*]\s+|\d+[.)]\s+)", " ", line).strip()
        if line:
            lines.append(line)
    return clean_text(" ".join(lines))


def useful_page_text(value: str) -> bool:
    text = clean_text(value)
    lowered = text.lower()
    if len(text) < 45:
        return False
    if any(phrase in lowered for phrase in ("cookie settings", "subscribe to our newsletter", "sign up", "javascript is disabled", "enable browser")):
        return False
    return True


def extract_source_content(content: bytes, content_type: str | None, url: str, title_hint: str = "") -> str:
    if content_type and not any(kind in content_type.lower() for kind in ("html", "xml", "text")):
        raise ValueError(f"Selected source is served as {content_type.split(';')[0]} and cannot be summarized as readable text yet.")

    soup = BeautifulSoup(content, "html.parser")
    for tag in soup.select("script, style, noscript, svg, nav, header, footer, form, aside"):
        tag.decompose()

    parts: list[str] = []
    heading = soup.find(["h1", "h2"])
    if heading:
        parts.append(clean_text(heading.get_text(" ")))

    meta = soup.find("meta", attrs={"name": re.compile(r"^(description|og:description)$", re.I)})
    if meta and meta.get("content"):
        parts.append(clean_text(meta.get("content")))

    for node in soup.select("main p, article p, main li, article li, .content p, .article p, p, li"):
        text = clean_text(node.get_text(" "))
        if useful_page_text(text):
            parts.append(text)
        if len(" ".join(parts)) >= MAX_SOURCE_CONTENT_CHARS:
            break

    combined = " ".join(dict.fromkeys(part for part in parts if part))
    if combined:
        return sentence_trim(combined, MAX_SOURCE_CONTENT_CHARS)
    raise ValueError(f"{title_hint or 'The selected source'} was reachable at {url}, but the page did not expose enough readable text for an AI summary.")


def extract_openai_output_text(data: dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str):
        return clean_text(data["output_text"])
    parts: list[str] = []
    for item in data.get("output") or []:
        for content in item.get("content") or []:
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return clean_text(" ".join(parts))


SUMMARY_INSTRUCTIONS = (
    "Summarize legal update source content for an internal APAC Practice Area Lead legal digest. "
    "Use only the provided source content. Return 2 concise factual sentences. "
    "Focus on what changed, dates/commencement if present, obligations, and product/workflow impact. "
    "Do not mention scraping, source scans, or unavailable facts."
)


def summary_input(item: dict[str, Any], content: str) -> str:
    return "\n".join(
        [
            f"Title: {clean_text(str(item.get('title') or 'Selected legal update'), 220)}",
            f"Source: {clean_text(str(item.get('source') or 'Unknown source'), 160)}",
            f"Jurisdiction: {clean_text(str(item.get('jurisdiction') or 'Unknown'), 80)}",
            f"Category: {clean_text(str(item.get('category') or 'Unknown'), 80)}",
            f"URL: {str(item.get('link') or '')}",
            "",
            "Source content:",
            content,
        ]
    )


def fallback_item_content(item: dict[str, Any]) -> str:
    parts = [
        clean_text(str(item.get("title") or ""), 260),
        clean_text(str(item.get("summary") or ""), 1400),
    ]
    combined = " ".join(part for part in parts if part)
    if useful_page_text(combined):
        return sentence_trim(combined, MAX_SOURCE_CONTENT_CHARS)
    return ""


def resolve_summary_provider(provider: str | None, api_key: str) -> str:
    selected = clean_text(provider or settings.ai_summary_provider or "auto").lower()
    if selected == "auto":
        return "openai" if api_key else "ollama"
    if selected not in {"openai", "ollama"}:
        raise ValueError("AI_SUMMARY_PROVIDER must be auto, openai, or ollama.")
    return selected


async def summarize_with_openai(
    client: httpx.AsyncClient,
    item: dict[str, Any],
    content: str,
    api_key: str,
    model: str,
) -> str:
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured, so AI summaries cannot be generated.")

    response = await client.post(
        OPENAI_RESPONSES_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "instructions": SUMMARY_INSTRUCTIONS,
            "input": summary_input(item, content),
            "max_output_tokens": 220,
        },
    )
    response.raise_for_status()
    summary = clean_ai_summary_output(extract_openai_output_text(response.json()))
    if not summary:
        raise RuntimeError("OpenAI returned an empty summary.")
    return sentence_trim(summary, MAX_AI_SUMMARY_CHARS)


async def summarize_with_ollama(
    client: httpx.AsyncClient,
    item: dict[str, Any],
    content: str,
    model: str,
    base_url: str,
) -> str:
    url = f"{base_url.rstrip('/')}{OLLAMA_GENERATE_PATH}"
    prompt = "\n\n".join([SUMMARY_INSTRUCTIONS, summary_input(item, content)])
    try:
        response = await client.post(
            url,
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,
                },
            },
        )
        response.raise_for_status()
    except Exception as exc:
        raise RuntimeError(
            f"Unable to reach local Ollama at {url}. Start Ollama and pull the configured model ({model}), or set AI_SUMMARY_PROVIDER=openai with an API key."
        ) from exc
    summary = clean_ai_summary_output(response.json().get("response", ""))
    if not summary:
        raise RuntimeError(f"Local Ollama model {model} returned an empty summary.")
    return sentence_trim(summary, MAX_AI_SUMMARY_CHARS)


async def summarize_source_item(
    client: httpx.AsyncClient,
    item: dict[str, Any],
    api_key: str | None = None,
    model: str | None = None,
    provider: str | None = None,
    local_base_url: str | None = None,
) -> dict[str, Any]:
    item_id = str(item.get("item_id") or "")
    link = str(item.get("link") or "")
    title = clean_text(str(item.get("title") or "Selected source"), 180)
    if not is_allowed_source_url(link):
        return {
            "item_id": item_id,
            "title": title,
            "link": link,
            "status": "error",
            "summary": "",
            "error": "Only public http(s) source URLs can be summarized.",
        }

    resolved_api_key = settings.openai_api_key if api_key is None else api_key

    try:
        resolved_provider = resolve_summary_provider(provider, resolved_api_key)
        resolved_model = model or (settings.openai_summary_model if resolved_provider == "openai" else settings.local_ai_model)
        try:
            response = await client.get(link)
            response.raise_for_status()
            content = extract_source_content(response.content, response.headers.get("content-type"), link, title)
        except Exception as fetch_exc:
            content = fallback_item_content(item)
            if not content:
                raise fetch_exc
        if resolved_provider == "openai":
            summary = await summarize_with_openai(client, item, content, resolved_api_key, resolved_model)
        else:
            summary = await summarize_with_ollama(
                client,
                item,
                content,
                resolved_model,
                local_base_url or settings.local_ai_base_url,
            )
        return {
            "item_id": item_id,
            "title": title,
            "link": link,
            "status": "ok",
            "summary": summary,
            "error": None,
        }
    except Exception as exc:
        return {
            "item_id": item_id,
            "title": title,
            "link": link,
            "status": "error",
            "summary": "",
            "error": str(exc),
        }


async def summarize_digest_sources(
    items: list[dict[str, Any]],
    api_key: str | None = None,
    model: str | None = None,
    provider: str | None = None,
    local_base_url: str | None = None,
) -> list[dict[str, Any]]:
    timeout = httpx.Timeout(max(settings.source_timeout_seconds, settings.openai_timeout_seconds))
    limits = httpx.Limits(max_connections=4, max_keepalive_connections=2)
    async with httpx.AsyncClient(timeout=timeout, headers=SUMMARY_HEADERS, follow_redirects=True, limits=limits, trust_env=False) as client:
        return await asyncio.gather(
            *(
                summarize_source_item(
                    client,
                    item,
                    api_key=api_key,
                    model=model,
                    provider=provider,
                    local_base_url=local_base_url,
                )
                for item in items[:12]
            )
        )
