from __future__ import annotations

import asyncio
import hashlib
import html
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import feedparser
import httpx
from bs4 import BeautifulSoup

from .config import (
    CATEGORY_RULES,
    COUNTRY_SIGNALS,
    LAW_ENFORCEMENT_NOISE,
    LEGAL_KEYWORDS,
    PRIMARY_CATEGORIES,
    SOURCES,
    Source,
    settings,
)
from .database import record_source_run, upsert_updates


MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

TRACKING_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}

MOJIBAKE_REPLACEMENTS = {
    "\u00e2\u0080\u0098": "'",
    "\u00e2\u0080\u0099": "'",
    "\u00e2\u0080\u009c": '"',
    "\u00e2\u0080\u009d": '"',
    "\u00e2\u0080\u0093": "-",
    "\u00e2\u0080\u0094": "-",
    "\u00e2\u0080\u00a6": "...",
    "\u00c2": "",
}

NOISE_TITLE_EXACT = {
    "audio",
    "bookmark",
    "bookmarks",
    "change password",
    "contact us",
    "download now",
    "discover the courts",
    "faqs",
    "for you",
    "hearing list",
    "home",
    "judgments",
    "log in",
    "log out",
    "manage logins",
    "news and resources",
    "privacy statement",
    "profile",
    "search",
    "self-help guides",
    "services",
    "skip",
    "subscriptions",
    "terms & conditions",
    "terms of use",
    "toggle navigation",
    "trusted websites",
}

NOISE_TITLE_CONTAINS = (
    "best viewed on chrome",
    "government agencies communicate via",
    "official website links end with",
    "we would love to keep you posted",
)

COMMERCIAL_TEXT_CONTAINS = (
    "early bird tickets",
    "open for pre sale",
    "pre order",
    "pre sale",
    "presale",
    "snag your early bird",
)

COMMERCIAL_LINK_HOSTS = {
    "store.lawnet.com",
}

EDITORIAL_TEXT_CONTAINS = (
    "says the writer",
)

EDITORIAL_TITLE_SUFFIXES = (
    "forum",
    "opinion",
)

GAZETTE_ID_RE = re.compile(r"\b[A-Z]{2}(?:-[A-Z]{2})?-[A-Z]-\d{8}-\d{6}\b")
BROWSER_COMPATIBLE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

SOURCE_REQUEST_HEADERS = {
    "sg_sso_new_legislation": {
        "User-Agent": BROWSER_COMPATIBLE_USER_AGENT,
        "Accept": "application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",
    },
}

POLITICAL_LEGISLATIVE_NOISE = {
    "dap",
    "ph meeting",
    "political party",
    "state assembly",
    "state legislative assembly",
    "legislative assembly",
}

STRONG_LEGAL_SIGNALS = {
    "bill",
    "case summary",
    "civil suit",
    "court",
    "court of appeal",
    "courts",
    "federal court",
    "hearing",
    "high court",
    "judicial",
    "judiciary",
    "judge",
    "judgment",
    "judgement",
    "law reform",
    "lawsuit",
    "legal action",
    "legal challenge",
    "legal proceedings",
    "litigation",
    "prosecution",
    "regulation",
    "regulatory",
    "rules of court",
    "statute",
    "supreme court",
    "trial",
    "tribunal",
}


def clean_text(value: str | None, max_length: int | None = None) -> str:
    if not value:
        return ""
    text = BeautifulSoup(html.unescape(value), "html.parser").get_text(" ")
    text = repair_text_encoding(text)
    for bad, good in MOJIBAKE_REPLACEMENTS.items():
        text = text.replace(bad, good)
    text = re.sub(r"\s+", " ", text).strip(" \t\r\n-\u2022|")
    if max_length and len(text) > max_length:
        return text[: max_length - 1].rstrip() + "..."
    return text


def suspicious_encoding_count(value: str) -> int:
    return sum(value.count(marker) for marker in ("\u00e2", "\u00c3", "\ufffd")) + sum(
        1 for char in value if "\u0080" <= char <= "\u009f"
    )


def repair_text_encoding(value: str) -> str:
    best = value
    best_score = suspicious_encoding_count(value)
    for encoding in ("cp1252", "latin-1"):
        try:
            candidate = value.encode(encoding).decode("utf-8")
        except UnicodeError:
            continue
        score = suspicious_encoding_count(candidate)
        if score < best_score:
            best = candidate
            best_score = score
    return best


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    query = urlencode([(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k not in TRACKING_PARAMS])
    return urlunparse((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/") or "/", "", query, ""))


def normalize_for_fingerprint(text: str) -> str:
    text = clean_text(text).lower()
    text = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def has_term(text: str, term: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text))


def is_commercial_noise(title: str, summary: str, link: str) -> bool:
    normalized_title = normalize_for_fingerprint(title)
    normalized_summary = normalize_for_fingerprint(summary)
    combined = f"{normalized_title} {normalized_summary}"
    parsed = urlparse(link or "")
    host = parsed.netloc.lower()
    path = parsed.path.lower()

    if normalized_title.startswith(("adv ", "advertisement ")):
        return True
    if host in COMMERCIAL_LINK_HOSTS:
        return True
    if "techlawfest.com" in host and ("/event/" in path or "ticket" in combined):
        return True
    return any(signal in combined for signal in COMMERCIAL_TEXT_CONTAINS)


def is_editorial_noise(title: str, summary: str) -> bool:
    normalized_title = normalize_for_fingerprint(title)
    normalized_summary = normalize_for_fingerprint(summary)
    combined = f"{normalized_title} {normalized_summary}"
    if any(normalized_title.endswith(f" {suffix}") for suffix in EDITORIAL_TITLE_SUFFIXES):
        return True
    return any(signal in combined for signal in EDITORIAL_TEXT_CONTAINS)


def is_malformed_gazette_item(source: Source, title: str, summary: str) -> bool:
    if source.id != "in_gazette":
        return False
    normalized_title = normalize_for_fingerprint(title)
    normalized_text = normalize_for_fingerprint(f"{title} {summary}")
    if any(
        phrase in normalized_text
        for phrase in (
            "gazettes on demand bills acts election by election land acquisition",
            "directorate of printing department of publication",
            "state gazettes important links",
            "recent extra ordinary gazettes",
            "recent weekly gazettes",
            "this gazette may contains multiple ministries",
            "this gazette may contains multiple subjects",
        )
    ):
        return True
    if normalized_title in {"department of publication", "recent weekly gazettes", "recent extra ordinary gazettes"}:
        return True
    return len(set(GAZETTE_ID_RE.findall(f"{title} {summary}"))) > 1


def detect_country_for_item(text: str) -> str | None:
    value = clean_text(text).lower()
    scores: dict[str, int] = {}
    for country, signals in COUNTRY_SIGNALS.items():
        score = 0
        for signal in signals:
            if has_term(value, signal):
                score += 3 if signal == country.lower() else 1
        if score:
            scores[country] = score
    if not scores:
        return None
    return max(scores.items(), key=lambda item: item[1])[0]


def make_fingerprint(country: str, title: str, link: str) -> str:
    normalized = normalize_for_fingerprint(title)
    fallback = canonicalize_url(link) if link else normalized
    payload = f"{country}|{normalized or fallback}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def request_headers_for_source(source: Source) -> dict[str, str] | None:
    return SOURCE_REQUEST_HEADERS.get(source.id)


def is_legal_relevant(text: str) -> bool:
    value = clean_text(text).lower()
    has_legal_signal = any(has_term(value, keyword) for keyword in LEGAL_KEYWORDS)
    if not has_legal_signal:
        return False
    if (
        any(has_term(value, keyword) for keyword in POLITICAL_LEGISLATIVE_NOISE)
        and not any(has_term(value, keyword) for keyword in STRONG_LEGAL_SIGNALS)
    ):
        return False
    has_noise = any(has_term(value, keyword) for keyword in LAW_ENFORCEMENT_NOISE)
    if has_noise:
        return any(
            has_term(value, keyword)
            for keyword in (
                "court",
                "courts",
                "judge",
                "judgment",
                "judgement",
                "trial",
                "hearing",
                "acquitted",
                "convicted",
                "sentence",
                "sentencing",
                "prosecution",
            )
        )
    return True


def detect_category(source: Source, title: str, summary: str) -> str:
    if source.force_category:
        return source.category
    text = clean_text(f"{title} {summary}").lower()
    if source.category in {"Press Release/Judiciary Updates", "Case Summary", "Recent Judgments"}:
        return source.category
    for category, needles in CATEGORY_RULES:
        if any(has_term(text, needle) for needle in needles):
            return category
    if source.category in PRIMARY_CATEGORIES:
        return source.category
    return "Legal News"


def parse_publication_date(value: str | None) -> str | None:
    if not value:
        return None
    text = clean_text(value)
    patterns = [
        r"(?<!\d)(?P<year>20\d{2}|19\d{2})[./-](?P<month_num>\d{1,2})[./-](?P<day>\d{1,2})(?!\d)",
        r"(?<!\d)(?P<day>\d{1,2})[\s./-](?P<month>[A-Za-z]{3,9})[\s,./-]+(?P<year>20\d{2}|19\d{2}|\d{2})(?!\d)",
        r"(?<!\d)(?P<day>\d{1,2})[./-](?P<month_num>\d{1,2})[./-](?P<year>20\d{2}|19\d{2}|\d{2})(?!\d)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        groups = match.groupdict()
        month = int(groups["month_num"]) if groups.get("month_num") else MONTHS.get(groups["month"].lower())
        if not month:
            continue
        year = int(groups["year"])
        if year < 100:
            year += 2000 if year < 70 else 1900
        try:
            return datetime(year, month, int(groups["day"]), tzinfo=timezone.utc).date().isoformat()
        except ValueError:
            continue
    try:
        parsed = parsedate_to_datetime(text)
        if parsed:
            return parsed.astimezone(timezone.utc).date().isoformat()
    except (TypeError, ValueError, IndexError):
        pass
    return None


def feed_date(entry: Any) -> str | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed:
        try:
            return datetime(*parsed[:6], tzinfo=timezone.utc).date().isoformat()
        except (TypeError, ValueError):
            pass
    return parse_publication_date(getattr(entry, "published", None) or getattr(entry, "updated", None))


def to_item(source: Source, title: str, summary: str, date: str | None, link: str) -> dict[str, Any] | None:
    title = clean_text(title, 260)
    summary = clean_text(summary, 520)
    if len(title) < 8:
        return None
    normalized_title = normalize_for_fingerprint(title)
    normalized_summary = normalize_for_fingerprint(summary)
    if normalized_title in NOISE_TITLE_EXACT:
        return None
    if any(needle in normalized_title or needle in normalized_summary for needle in NOISE_TITLE_CONTAINS):
        return None
    if is_commercial_noise(title, summary, link):
        return None
    if is_editorial_noise(title, summary):
        return None
    if is_malformed_gazette_item(source, title, summary):
        return None
    if source.require_date and not date:
        return None
    source_text = clean_text(f"{title} {summary}").lower()
    if source.required_terms and not any(has_term(source_text, term) for term in source.required_terms):
        return None
    if source.excluded_terms and any(has_term(source_text, term) for term in source.excluded_terms):
        return None
    if not source.include_all and not is_legal_relevant(f"{title} {summary}"):
        return None
    link = canonicalize_url(link or source.url)
    country = source.country
    if source.country_detection:
        detected_country = detect_country_for_item(f"{title} {summary} {link}")
        if not detected_country:
            return None
        country = detected_country
    return {
        "country": country,
        "source": source.name,
        "source_tab": source.source_tab,
        "title": title,
        "summary": summary,
        "date": date,
        "link": link,
        "category": detect_category(source, title, summary),
        "fingerprint": make_fingerprint(country, title, link),
    }


async def fetch_rss(client: httpx.AsyncClient, source: Source) -> list[dict[str, Any]]:
    response = await client.get(source.url, headers=request_headers_for_source(source))
    response.raise_for_status()
    feed = feedparser.parse(response.content)
    items: list[dict[str, Any]] = []
    for entry in feed.entries[: settings.source_limit_per_run]:
        title = clean_text(getattr(entry, "title", ""))
        summary = clean_text(getattr(entry, "summary", "") or getattr(entry, "description", ""))
        link = getattr(entry, "link", "") or source.url
        item = to_item(source, title, summary, feed_date(entry), link)
        if item:
            items.append(item)
    return items


def best_link(node: Any, source: Source) -> Any:
    if source.id == "in_gazette":
        return node.select_one("a[href]") or (node if getattr(node, "name", "") == "a" and node.get("href") else None)
    if source.link_selector:
        selected = node.select_one(source.link_selector)
        if selected and selected.get("href"):
            return selected
    anchors = [anchor for anchor in node.select("a[href]") if clean_text(anchor.get_text(" "))]
    if anchors:
        return max(anchors, key=lambda a: len(clean_text(a.get_text(" "))))
    return node if getattr(node, "name", "") == "a" and node.get("href") else None


def best_title(node: Any, link_node: Any, source: Source) -> str:
    if source.id == "in_gazette":
        return gazette_title(node)
    if source.title_selector:
        selected = node.select_one(source.title_selector)
        if selected:
            return clean_text(selected.get_text(" "))
    for selector in ("h1", "h2", "h3", "h4", ".title", ".headline", "[class*=title]", "[class*=headline]"):
        selected = node.select_one(selector)
        if selected:
            text = clean_text(selected.get_text(" "))
            if len(text) >= 8:
                return text
    link_text = clean_text(link_node.get_text(" ") if link_node else "")
    if len(link_text) >= 8 and link_text.lower() not in {"download", "read more", "view more"}:
        return link_text
    node_text = clean_text(node.get_text(" "))
    parts = re.split(r"\s{2,}| \| | - ", node_text)
    for part in parts:
        part = clean_text(part)
        if len(part) >= 8 and part.lower() not in {"download", "read more", "view more"}:
            return part
    return node_text[:220]


def node_summary(node: Any, source: Source) -> str:
    if source.id == "in_gazette":
        title = gazette_title(node)
        text = clean_text(node.get_text(" "), 520)
        return text if text != title else ""
    if source.summary_selector:
        selected = node.select_one(source.summary_selector)
        if selected:
            return clean_text(selected.get_text(" "), 520)
    return clean_text(node.get_text(" "), 520)


def node_date(node: Any, source: Source) -> str | None:
    if source.date_selector:
        selected = node.select_one(source.date_selector)
        if selected:
            return parse_publication_date(selected.get_text(" "))
    time_node = node.select_one("time[datetime]")
    if time_node:
        return parse_publication_date(time_node.get("datetime"))
    return parse_publication_date(node.get_text(" "))


def sci_recent_judgment_nodes(soup: BeautifulSoup) -> list[Any]:
    judgment_heading = None
    for heading in soup.find_all(["h2", "h3", "h4", "h5", "strong"]):
        if clean_text(heading.get_text(" ")).lower() == "judgments":
            judgment_heading = heading
            break
    if judgment_heading:
        container = judgment_heading.find_next("ul")
        if container:
            nodes = [
                anchor
                for anchor in container.select("a[href]")
                if "diary number" in clean_text(anchor.get_text(" ")).lower()
                and "uploaded on" in clean_text(anchor.get_text(" ")).lower()
            ]
            if nodes:
                return nodes
    return [
        anchor
        for anchor in soup.select("a[href]")
        if "diary number" in clean_text(anchor.get_text(" ")).lower()
        and "uploaded on" in clean_text(anchor.get_text(" ")).lower()
        and "type=o" not in (anchor.get("href") or "").lower()
    ]


def gazette_nodes(soup: BeautifulSoup) -> list[Any]:
    rows = [
        row
        for row in soup.select("tr")
        if GAZETTE_ID_RE.search(clean_text(row.get_text(" ")))
        and parse_publication_date(row.get_text(" "))
    ]
    if rows:
        return rows
    return [
        node
        for node in soup.select("li, .item, .card")
        if GAZETTE_ID_RE.search(clean_text(node.get_text(" ")))
        and parse_publication_date(node.get_text(" "))
    ]


def gazette_title(node: Any) -> str:
    cells = node.find_all(["td", "th"], recursive=False) if hasattr(node, "find_all") else []
    raw_parts = [clean_text(cell.get_text(" ")) for cell in cells] or [clean_text(node.get_text(" "))]
    parts: list[str] = []
    for part in raw_parts:
        normalized = normalize_for_fingerprint(part)
        if not part:
            continue
        if parse_publication_date(part):
            continue
        if GAZETTE_ID_RE.search(part):
            continue
        if re.fullmatch(r"(?:download\s*)?\d+(?:\.\d+)?\s*mb", part, flags=re.IGNORECASE):
            continue
        if normalized in {"download", "view", "pdf", "gazette id", "publish date", "subject", "ministry"}:
            continue
        parts.append(part)
    title = clean_text(" ".join(dict.fromkeys(parts)))
    if title:
        return title
    text = clean_text(node.get_text(" "))
    text = GAZETTE_ID_RE.sub("", text)
    text = re.sub(r"\b\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4}\b", "", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\s*MB\b", "", text, flags=re.IGNORECASE)
    return clean_text(text, 220)


def lom_whats_new_heading(soup: BeautifulSoup) -> Any | None:
    for node in soup.find_all(["h1", "h2", "h3", "h4", "strong", "b", "span"]):
        text = normalize_for_fingerprint(node.get_text(" "))
        if "what" in text and "new" in text:
            return node
    return None


def parse_lom_whats_new_date(value: str) -> str | None:
    text = clean_text(value).lower()
    today = datetime.now(timezone.utc).date()
    if text == "today":
        return today.isoformat()
    match = re.fullmatch(r"(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3,9})", text, flags=re.IGNORECASE)
    if not match:
        return None
    month = MONTHS.get(match.group("month").lower())
    if not month:
        return None
    try:
        candidate = datetime(today.year, month, int(match.group("day")), tzinfo=timezone.utc).date()
    except ValueError:
        return None
    if (candidate - today).days > 14:
        candidate = datetime(today.year - 1, month, int(match.group("day")), tzinfo=timezone.utc).date()
    return candidate.isoformat()


def is_lom_legislation_group(value: str) -> bool:
    normalized = normalize_for_fingerprint(value)
    return normalized in {
        "principal act",
        "amending act",
        "subsidiary legislation",
        "p u a",
        "p u b",
    }


def lom_whats_new_items(soup: BeautifulSoup, source: Source) -> list[dict[str, Any]]:
    heading = lom_whats_new_heading(soup)
    elements = heading.find_all_next(["h2", "h3", "h4", "h5", "strong", "b", "p", "span", "a"]) if heading else soup.find_all(["h2", "h3", "h4", "h5", "strong", "b", "p", "span", "a"])
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    current_date: str | None = None
    current_group = ""
    for node in elements:
        if len(items) >= settings.source_limit_per_run:
            break
        text = clean_text(node.get_text(" "))
        normalized = normalize_for_fingerprint(text)
        if not text or normalized == "what s new":
            continue
        if "top hit" in normalized or normalized in {"search", "search laws of malaysia"}:
            break
        parsed_date = parse_lom_whats_new_date(text)
        if parsed_date:
            current_date = parsed_date
            current_group = ""
            continue
        if "no record to display" in normalized:
            continue
        if node.name in {"strong", "b", "h4", "h5", "span"} and is_lom_legislation_group(text):
            current_group = text
            continue
        if node.name != "a" or not current_date:
            continue
        href = node.get("href") or ""
        title = clean_text(text, 260)
        if len(title) < 8 or title in seen:
            continue
        seen.add(title)
        link = urljoin(source.url, href) if href else source.url
        item = to_item(source, title, current_group, current_date, link)
        if item:
            items.append(item)
    return items


async def fetch_html(client: httpx.AsyncClient, source: Source) -> list[dict[str, Any]]:
    response = await client.get(source.url, headers=request_headers_for_source(source))
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")
    for tag in soup.select("script, style, noscript, svg, nav, footer"):
        tag.decompose()
    for tag in soup.select("form"):
        tag.unwrap()
    if source.id == "in_supreme_court_judgments":
        nodes = sci_recent_judgment_nodes(soup)
    elif source.id == "in_gazette":
        nodes = gazette_nodes(soup)
    elif source.id == "my_lom_whats_new":
        return lom_whats_new_items(soup, source)
    else:
        nodes = soup.select(source.item_selector) if source.item_selector else soup.select("article, li, tr, .card")
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in nodes:
        if len(items) >= settings.source_limit_per_run:
            break
        link_node = best_link(node, source)
        href = link_node.get("href") if link_node else ""
        link = urljoin(source.url, href) if href else source.url
        title = best_title(node, link_node, source)
        if not title or title in seen:
            continue
        seen.add(title)
        item = to_item(source, title, node_summary(node, source), node_date(node, source), link)
        if item:
            items.append(item)
    return items


async def fetch_source(client: httpx.AsyncClient, source: Source) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        if source.source_type == "rss":
            items = await fetch_rss(client, source)
        else:
            items = await fetch_html(client, source)
        run = record_source_run(source.id, source.name, source.country, "ok", len(items))
        return items, run
    except Exception as exc:
        run = record_source_run(source.id, source.name, source.country, "error", 0, str(exc))
        return [], run


async def refresh_all_sources() -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    headers = {"User-Agent": settings.user_agent, "Accept": "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8"}
    timeout = httpx.Timeout(settings.source_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True, trust_env=False) as client:
        results = await asyncio.gather(*(fetch_source(client, source) for source in SOURCES))
    runs = [run for _, run in results]
    items = [item for source_items, _ in results for item in source_items]
    unique: dict[str, dict[str, Any]] = {}
    for item in items:
        unique[item["fingerprint"]] = item
    inserted, updated = upsert_updates(list(unique.values()))
    finished_at = datetime.now(timezone.utc)
    return {
        "started_at": started_at,
        "finished_at": finished_at,
        "sources_checked": len(SOURCES),
        "items_seen": len(items),
        "inserted": inserted,
        "updated": updated,
        "failed_sources": sum(1 for run in runs if run["status"] == "error"),
        "runs": runs,
    }
