from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from .config import SOURCES
from .fetcher import clean_text, has_term


APAC_JURISDICTIONS = [
    "Malaysia",
    "Singapore",
    "Hong Kong",
    "Australia",
    "New Zealand",
    "India",
]

RISK_DOMAINS = [
    {
        "id": "litigation_spikes",
        "label": "Litigation Spikes",
        "business_weight": 11,
        "keywords": (
            "case law",
            "court",
            "courts",
            "dispute",
            "disputes",
            "enforcement",
            "judgment",
            "judgement",
            "judicial",
            "litigation",
            "tribunal",
        ),
    },
    {
        "id": "ai_regulation",
        "label": "AI Regulation Activity",
        "business_weight": 15,
        "keywords": (
            "ai",
            "ai governance",
            "ai regulation",
            "artificial intelligence",
            "automation",
            "generative ai",
            "legal ai",
            "machine learning",
        ),
    },
    {
        "id": "cyber_privacy",
        "label": "Cyber / Privacy Changes",
        "business_weight": 15,
        "keywords": (
            "breach",
            "cyber",
            "cybersecurity",
            "data protection",
            "digital personal data",
            "gdpr",
            "pdpa",
            "privacy",
            "privacy law",
        ),
    },
    {
        "id": "employment",
        "label": "Employment Law Movement",
        "business_weight": 10,
        "keywords": (
            "dismissal",
            "employees",
            "employment",
            "hr regulation",
            "labour",
            "unions",
            "wages",
            "workers",
            "workplace",
        ),
    },
    {
        "id": "sanctions_trade",
        "label": "Sanctions / Trade Restrictions",
        "business_weight": 15,
        "keywords": (
            "customs",
            "embargo",
            "export controls",
            "import/export",
            "sanctions",
            "tariffs",
            "trade restrictions",
        ),
    },
]

DOMAIN_BY_ID = {domain["id"]: domain for domain in RISK_DOMAINS}
SOURCE_BY_NAME = {source.name: source for source in SOURCES}


def parse_update_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def update_text(update: dict[str, Any]) -> str:
    tags = update.get("tags") or []
    if isinstance(tags, str):
        tags_text = tags
    else:
        tags_text = " ".join(str(tag) for tag in tags)
    return clean_text(
        " ".join(
            str(value or "")
            for value in (
                update.get("title"),
                update.get("summary"),
                update.get("category"),
                update.get("practice_area"),
                update.get("practiceArea"),
                update.get("source"),
                update.get("source_type"),
                tags_text,
            )
        )
    ).lower()


def matched_domain_terms(update: dict[str, Any], domain_id: str) -> list[str]:
    text = update_text(update)
    domain = DOMAIN_BY_ID[domain_id]
    matched = [keyword for keyword in domain["keywords"] if has_term(text, keyword)]
    category = clean_text(update.get("category")).lower()
    source = clean_text(update.get("source")).lower()
    if domain_id == "litigation_spikes":
        if category in {"recent judgments", "case summary"}:
            matched.append(category)
        if any(term in source for term in ("court", "judiciary", "tribunal")):
            matched.append("court source")
    return list(dict.fromkeys(matched))


def classify_update_domains(update: dict[str, Any]) -> list[str]:
    domains = [
        domain["id"]
        for domain in RISK_DOMAINS
        if matched_domain_terms(update, domain["id"])
    ]
    return domains


def source_authority(update: dict[str, Any]) -> dict[str, Any]:
    source = SOURCE_BY_NAME.get(str(update.get("source") or ""))
    source_name = clean_text(update.get("source")).lower()
    source_type = source.source_type if source else str(update.get("source_type") or "unknown")
    official_terms = (
        "attorney-general",
        "commission",
        "court",
        "courts",
        "gazette",
        "government",
        "judiciary",
        "ministry",
        "regulator",
        "reserve bank",
        "sebi",
        "supreme court",
        "tribunal",
    )
    specialist_terms = ("law watch", "livelaw", "bar & bench", "scc online", "malaysian bar", "law council")
    tier_one_media_terms = ("cna", "channel newsasia", "straits times", "reuters", "bloomberg")
    if source and source.official:
        return {"score": 25, "label": "High", "tier": "Regulator / Court / Government", "source_type": source_type}
    if source and (source.category == "Legal News" or source.source_tab == "News Sources"):
        if any(term in source_name for term in specialist_terms):
            return {"score": 19, "label": "Medium-High", "tier": "Major legal publisher / specialist legal update", "source_type": source_type}
        if any(term in source_name for term in tier_one_media_terms):
            return {"score": 15, "label": "Medium", "tier": "Tier-1 media", "source_type": source_type}
        return {"score": 10, "label": "Medium-Low", "tier": "General media / opinion", "source_type": source_type}
    if any(term in source_name for term in official_terms):
        return {"score": 23, "label": "High", "tier": "Official consultation / legislation / enforcement notice", "source_type": source_type}
    if any(term in source_name for term in specialist_terms) or "legal" in source_name:
        return {"score": 19, "label": "Medium-High", "tier": "Major legal publisher / specialist legal update", "source_type": source_type}
    if any(term in source_name for term in tier_one_media_terms):
        return {"score": 15, "label": "Medium", "tier": "Tier-1 media", "source_type": source_type}
    if source_type in {"rss", "html"} or "news" in source_name:
        return {"score": 10, "label": "Medium-Low", "tier": "General media / opinion", "source_type": source_type}
    return {"score": 6, "label": "Low", "tier": "Blog / unknown / duplicate syndicated source", "source_type": source_type}


def recency_score(update: dict[str, Any], now: datetime) -> int:
    date = parse_update_datetime(update.get("date")) or parse_update_datetime(update.get("first_seen_at"))
    if not date:
        return 4
    age_days = max(0, (now - date).days)
    if age_days <= 7:
        return 10
    if age_days <= 30:
        return 6
    if age_days <= 90:
        return 3
    return 1


def severity_score(update: dict[str, Any], domain_id: str) -> int:
    category = clean_text(update.get("category")).lower()
    title = clean_text(update.get("title")).lower()
    score = 10
    if category in {"recent judgments", "case summary"}:
        score += 10
    elif category == "legislation news":
        score += 12
    elif category == "press release/judiciary updates":
        score += 8
    if any(has_term(title, term) for term in DOMAIN_BY_ID[domain_id]["keywords"]):
        score += 5
    return min(score, 30)


def confidence_score(update: dict[str, Any], domain_id: str) -> int:
    matches = matched_domain_terms(update, domain_id)
    if len(matches) >= 3:
        return 15
    if len(matches) == 2:
        return 11
    return 7 if matches else 0


def signal_for_update(update: dict[str, Any], domain_id: str, now: datetime) -> dict[str, Any]:
    authority = source_authority(update)
    severity = severity_score(update, domain_id)
    recency = recency_score(update, now)
    confidence = confidence_score(update, domain_id)
    business = int(DOMAIN_BY_ID[domain_id]["business_weight"])
    score = min(100, severity + authority["score"] + recency + confidence + business)
    return {
        "id": update.get("id"),
        "title": update.get("title"),
        "summary": update.get("summary") or "",
        "date": update.get("date"),
        "link": update.get("link"),
        "category": update.get("category"),
        "source": update.get("source"),
        "source_type": authority["source_type"],
        "authority": authority["label"],
        "authority_tier": authority["tier"],
        "score": score,
        "score_components": {
            "severity": severity,
            "authority": authority["score"],
            "recency": recency,
            "businessRelevance": business,
            "confidence": confidence,
        },
    }


def heat_level(score: int) -> str:
    if score <= 0:
        return "No Signals"
    if score >= 86:
        return "Critical"
    if score >= 71:
        return "Elevated"
    if score >= 51:
        return "Active"
    if score >= 26:
        return "Watch"
    return "Low"


def authority_weight(label: str) -> float:
    return {
        "High": 1.0,
        "Medium-High": 0.8,
        "Medium": 0.65,
        "Medium-Low": 0.5,
        "Low": 0.35,
    }.get(label, 0.35)


def score_cap(signal_count: int, high_authority_count: int) -> tuple[int, str]:
    if signal_count <= 0:
        return 0, "No signals in selected period."
    if signal_count == 1:
        if high_authority_count:
            return 70, "Score capped at 70 because only 1 high-authority signal was found in the selected period."
        return 60, "Score capped at 60 because only 1 medium-or-lower authority signal was found in the selected period."
    if signal_count <= 3:
        if high_authority_count:
            return 85, "Score capped at 85 because there are 2-3 signals with high-authority support."
        return 75, "Score capped at 75 because there are only 2-3 signals and no high-authority support."
    if high_authority_count:
        return 100, "Critical is available because there are 4+ signals with high-authority support."
    return 85, "Score capped at 85 because 4+ signals were found but none are high-authority."


def empty_cell(jurisdiction: str, domain_id: str) -> dict[str, Any]:
    return {
        "jurisdiction": jurisdiction,
        "domain": domain_id,
        "domain_label": DOMAIN_BY_ID[domain_id]["label"],
        "score": 0,
        "level": "No Signals",
        "signal_count": 0,
        "weighted_signal_count": 0,
        "authority_mix": {},
        "velocity": {"last7": 0, "previous7": 0, "previous30": 0, "delta7": 0, "trend": "insufficient historical data"},
        "score_rationale": "No signals in selected period.",
        "score_explanation": "Risk scores will appear as legal updates are collected.",
        "updates": [],
    }


def build_risk_heatmap(
    updates: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    cells: dict[str, dict[str, dict[str, Any]]] = {
        jurisdiction: {domain["id"]: empty_cell(jurisdiction, domain["id"]) for domain in RISK_DOMAINS}
        for jurisdiction in APAC_JURISDICTIONS
    }
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)

    for update in updates:
        jurisdiction = update.get("country")
        if jurisdiction not in APAC_JURISDICTIONS:
            continue
        for domain_id in classify_update_domains(update):
            grouped[(jurisdiction, domain_id)].append(signal_for_update(update, domain_id, now))

    domain_max_counts: dict[str, int] = {}
    for domain in RISK_DOMAINS:
        domain_counts = [len(grouped.get((jurisdiction, domain["id"]), [])) for jurisdiction in APAC_JURISDICTIONS]
        domain_max_counts[domain["id"]] = max(domain_counts) if domain_counts else 0

    for (jurisdiction, domain_id), signals in grouped.items():
        dated = [
            (parse_update_datetime(signal.get("date")), signal)
            for signal in signals
        ]
        last7 = sum(1 for date, _signal in dated if date and now - timedelta(days=7) <= date <= now)
        previous7 = sum(
            1 for date, _signal in dated if date and now - timedelta(days=14) <= date < now - timedelta(days=7)
        )
        previous30 = sum(
            1 for date, _signal in dated if date and now - timedelta(days=37) <= date < now - timedelta(days=7)
        )
        signal_count = len(signals)
        authority_mix: dict[str, int] = {}
        for signal in signals:
            authority_mix[signal["authority"]] = authority_mix.get(signal["authority"], 0) + 1
        high_authority_count = authority_mix.get("High", 0)
        weighted_signal_count = round(sum(authority_weight(signal["authority"]) for signal in signals), 1)
        volume_score = min(30, signal_count * 7)
        velocity_delta = last7 - previous7
        velocity_score = max(-8, min(18, velocity_delta * 5))
        relative_score = 0
        domain_max = domain_max_counts.get(domain_id, 0)
        if domain_max:
            relative_score = round((signal_count / domain_max) * 8)
        average_signal_score = round(sum(signal["score"] for signal in signals) / signal_count)
        uncapped_score = max(1, min(100, round(average_signal_score * 0.55 + volume_score + velocity_score + relative_score)))
        cap, cap_rationale = score_cap(signal_count, high_authority_count)
        score = min(uncapped_score, cap)
        trend = "insufficient historical data"
        if previous7:
            trend = "rising" if velocity_delta > 0 else "stable" if velocity_delta == 0 else "falling"
        elif last7:
            trend = "new activity"
        score_explanation = (
            f"{signal_count} raw signal{'s' if signal_count != 1 else ''}; "
            f"{weighted_signal_count} weighted signals; "
            f"{high_authority_count} high-authority source{'s' if high_authority_count != 1 else ''}; "
            f"7-day delta {velocity_delta:+d} vs prior 7d."
        )
        cells[jurisdiction][domain_id] = {
            "jurisdiction": jurisdiction,
            "domain": domain_id,
            "domain_label": DOMAIN_BY_ID[domain_id]["label"],
            "score": score,
            "level": heat_level(score),
            "uncapped_score": uncapped_score,
            "score_cap": cap,
            "signal_count": signal_count,
            "weighted_signal_count": weighted_signal_count,
            "authority_mix": authority_mix,
            "velocity": {"last7": last7, "previous7": previous7, "previous30": previous30, "delta7": velocity_delta, "trend": trend},
            "score_rationale": cap_rationale if signal_count <= 3 or uncapped_score > cap else score_explanation,
            "score_explanation": score_explanation,
            "updates": sorted(signals, key=lambda signal: (signal.get("date") or "", signal["score"]), reverse=True)[:8],
        }

    all_cells = [cell for row in cells.values() for cell in row.values()]
    active_cells = [cell for cell in all_cells if cell["score"] > 0]
    total_displayed_signals = sum(cell["signal_count"] for cell in active_cells)
    total_ingested_week = sum(
        1
        for update in updates
        if update.get("country") in APAC_JURISDICTIONS
        and (date := (parse_update_datetime(update.get("date")) or parse_update_datetime(update.get("first_seen_at"))))
        and now - timedelta(days=7) <= date <= now
    )
    highest = max(active_cells, key=lambda cell: cell["score"], default=None)
    hottest_domain = None
    if active_cells:
        domain_totals = {
            domain["id"]: sum(cell["weighted_signal_count"] for cell in active_cells if cell["domain"] == domain["id"])
            for domain in RISK_DOMAINS
        }
        hottest_domain_id = max(domain_totals, key=domain_totals.get)
        hottest_domain = DOMAIN_BY_ID[hottest_domain_id]["label"]
    rising = max(
        (cell for cell in active_cells if cell["velocity"]["delta7"] > 0 or cell["velocity"]["last7"] > 0),
        key=lambda cell: (cell["velocity"]["delta7"], cell["velocity"]["last7"], cell["weighted_signal_count"]),
        default=None,
    )

    return {
        "jurisdictions": APAC_JURISDICTIONS,
        "domains": [{"id": domain["id"], "label": domain["label"]} for domain in RISK_DOMAINS],
        "cells": cells,
        "kpis": {
            "highestRiskJurisdiction": {
                "value": highest["jurisdiction"] if highest else "No signals",
                "detail": f"{highest['domain_label']} / {highest['score']} {highest['level']} / {highest['signal_count']} signals" if highest else "Risk scores will appear as legal updates are collected.",
            },
            "fastestRisingRisk": {
                "value": f"{rising['jurisdiction']} / {rising['domain_label']}" if rising else "Insufficient data",
                "detail": f"{rising['velocity']['trend']} / {rising['velocity']['delta7']:+d} vs prior 7d / {rising['signal_count']} signals" if rising else "No recent signal movement yet.",
            },
            "hottestRiskDomain": {
                "value": hottest_domain or "No signals",
                "detail": "Highest weighted signal concentration across the six jurisdictions." if hottest_domain else "No matching legal updates yet.",
            },
            "totalDisplayedSignals": {
                "value": total_displayed_signals,
                "detail": f"{total_ingested_week} total ingested updates this week; displayed signals may count one update in multiple domains.",
            },
        },
    }
