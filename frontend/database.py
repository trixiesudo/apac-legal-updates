from __future__ import annotations

import json
import sqlite3
import re
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import PRIMARY_CATEGORIES, RETIRED_SOURCE_NAMES, SOURCES, settings


OLD_CATEGORY_MAP = {
    "Judgment": "Recent Judgments",
    "Court News": "Press Release/Judiciary Updates",
    "Practice Direction": "Press Release/Judiciary Updates",
    "Court News/Legal News": "Legal News",
    "Legal News": "Legal News",
    "Legislation & Regulation": "Legislation News",
    "Profession": "Legal News",
}

POLICY_CATEGORY = "Policy/Regulatory News"
POLICY_NEWS_TERMS = (
    "policy",
    "policies",
    "regulatory",
    "regulator",
    "monetary authority",
    "mas",
    "insurance association",
    "guidelines",
    "consultation paper",
)

SOURCE_TAB_BY_SOURCE = {
    source.name: source.source_tab
    for source in SOURCES
    if source.source_tab
}

FORCED_CATEGORY_BY_SOURCE = {
    source.name: source.category
    for source in SOURCES
    if source.force_category
}

GAZETTE_ID_RE = re.compile(r"\b[A-Z]{2}(?:-[A-Z]{2})?-[A-Z]-\d{8}-\d{6}\b")
GAZETTE_DATE_RE = re.compile(r"\b\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4}\b")
GAZETTE_SIZE_RE = re.compile(r"\b\d+(?:\.\d+)?\s*MB\b", flags=re.IGNORECASE)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_category(category: str | None) -> str:
    if not category:
        return "Legal News"
    mapped = OLD_CATEGORY_MAP.get(category, category)
    return mapped if mapped in PRIMARY_CATEGORIES else "Legal News"


def has_update_term(text: str, term: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text))


def normalize_stored_category(category: str | None, title: str | None = None, summary: str | None = None) -> str:
    normalized = normalize_category(category)
    text = f"{title or ''} {summary or ''}".lower()
    if normalized == "Legal News" and any(has_update_term(text, term) for term in POLICY_NEWS_TERMS):
        return POLICY_CATEGORY
    return normalized


def clean_gazette_display_text(value: str) -> str:
    text = GAZETTE_ID_RE.sub("", value or "")
    text = GAZETTE_DATE_RE.sub("", text)
    text = GAZETTE_SIZE_RE.sub("", text)
    text = re.sub(r"\bDownload\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -|.,")


def present_update_row(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row) | {"is_new": bool(row["is_new"])}
    if item.get("source") == "Gazette of India":
        title = clean_gazette_display_text(item.get("title") or "")
        summary = clean_gazette_display_text(item.get("summary") or "")
        item["title"] = title or item["title"]
        item["summary"] = summary if summary and summary != title else item["title"]
    return item


def active_update_clause() -> tuple[str, list[str]]:
    retired = sorted(RETIRED_SOURCE_NAMES)
    if not retired:
        return "", []
    placeholders = ", ".join("?" for _ in retired)
    return f"source NOT IN ({placeholders})", retired


def quality_update_clause() -> tuple[str, list[str]]:
    return (
        """
        NOT (
            source = ?
            AND (
                title = ?
                OR title LIKE ?
                OR title LIKE ?
                OR title LIKE ?
                OR summary LIKE ?
                OR summary LIKE ?
                OR summary LIKE ?
            )
        )
        """,
        [
            "Gazette of India",
            "Department of Publication",
            "Recent Extra Ordinary Gazettes%",
            "Recent Weekly Gazettes%",
            "This Gazette may contains Multiple%",
            "%Gazettes on Demand Bills & Acts Election%",
            "%Directorate of Printing Department of Publication%",
            "%State Gazettes Important Links%",
        ],
    )


def political_news_update_clause() -> tuple[str, list[str]]:
    return (
        """
        NOT (
            source = ?
            AND category = ?
            AND (
                title LIKE ?
                OR summary LIKE ?
                OR title LIKE ?
                OR summary LIKE ?
            )
            AND (
                title LIKE ?
                OR summary LIKE ?
                OR title LIKE ?
                OR summary LIKE ?
            )
        )
        """,
        [
            "Free Malaysia Today - Nation",
            "Legislation News",
            "%DAP%",
            "%DAP%",
            "%PH meeting%",
            "%PH meeting%",
            "%legislative assembly%",
            "%legislative assembly%",
            "%state assembly%",
            "%state assembly%",
        ],
    )


def editorial_update_clause() -> tuple[str, list[str]]:
    return (
        """
        NOT (
            (
                title LIKE ?
                OR title LIKE ?
                OR summary LIKE ?
            )
            AND source_tab = ?
        )
        """,
        [
            "%: Opinion",
            "%: Forum",
            "%says the writer%",
            "News Sources",
        ],
    )


def visible_update_clauses() -> tuple[list[str], list[str]]:
    clauses: list[str] = []
    params: list[str] = []
    for clause, clause_params in (
        active_update_clause(),
        quality_update_clause(),
        political_news_update_clause(),
        editorial_update_clause(),
    ):
        if clause:
            clauses.append(clause)
            params.extend(clause_params)
    return clauses, params


def updates_table_sql(table_name: str = "updates") -> str:
    allowed_categories = ", ".join(f"'{category}'" for category in PRIMARY_CATEGORIES)
    return f"""
            CREATE TABLE {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                country TEXT NOT NULL,
                source TEXT NOT NULL,
                source_tab TEXT,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                date TEXT,
                link TEXT NOT NULL,
                category TEXT NOT NULL CHECK(category IN ({allowed_categories})),
                fingerprint TEXT NOT NULL UNIQUE,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            )
            """


def legal_ai_updates_table_sql() -> str:
    return """
            CREATE TABLE IF NOT EXISTS legal_ai_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                source TEXT NOT NULL,
                region TEXT NOT NULL,
                source_type TEXT NOT NULL,
                category TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                date TEXT,
                link TEXT NOT NULL,
                fingerprint TEXT NOT NULL UNIQUE,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            )
            """


def newsletters_table_sql() -> str:
    return """
            CREATE TABLE IF NOT EXISTS newsletters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                html_body TEXT NOT NULL DEFAULT '',
                text_body TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                published_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """


def weekly_digests_table_sql() -> str:
    return """
            CREATE TABLE IF NOT EXISTS weekly_digests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                digest_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                html_body TEXT NOT NULL DEFAULT '',
                text_body TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                published_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                item_count INTEGER NOT NULL DEFAULT 0,
                department TEXT NOT NULL DEFAULT '',
                digest_type TEXT NOT NULL DEFAULT '',
                entries_json TEXT NOT NULL DEFAULT '[]'
            )
            """


@contextmanager
def connect() -> Any:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        ensure_updates_schema(conn)
        conn.execute(legal_ai_updates_table_sql())
        conn.execute(newsletters_table_sql())
        conn.execute(weekly_digests_table_sql())
        conn.execute("CREATE INDEX IF NOT EXISTS idx_updates_country ON updates(country)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_updates_category ON updates(category)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_updates_date ON updates(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_updates_seen ON updates(first_seen_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_legal_ai_region ON legal_ai_updates(region)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_legal_ai_category ON legal_ai_updates(category)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_legal_ai_date ON legal_ai_updates(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_legal_ai_seen ON legal_ai_updates(first_seen_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_legal_ai_source ON legal_ai_updates(source_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_newsletters_status ON newsletters(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_newsletters_published ON newsletters(published_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_weekly_digests_status ON weekly_digests(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_weekly_digests_published ON weekly_digests(published_at)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS source_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                source TEXT NOT NULL,
                country TEXT NOT NULL,
                status TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                item_count INTEGER NOT NULL DEFAULT 0,
                error TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_source_runs_time ON source_runs(fetched_at)")
        migrate_categories(conn)


def ensure_updates_schema(conn: sqlite3.Connection) -> None:
    existing = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'updates'"
    ).fetchone()
    if not existing:
        conn.execute(updates_table_sql())
        return

    columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(updates)").fetchall()
    }
    existing_sql = existing["sql"] or ""
    if (
        "source_tab" in columns
        and "CHECK(category IN" in existing_sql
        and all(f"'{category}'" in existing_sql for category in PRIMARY_CATEGORIES)
    ):
        return

    selected_source_tab = "source_tab" if "source_tab" in columns else "NULL AS source_tab"
    rows = conn.execute(
        f"""
        SELECT id, country, source, {selected_source_tab}, title, summary, date, link, category,
               fingerprint, first_seen_at, last_seen_at
        FROM updates
        """
    ).fetchall()
    conn.execute("ALTER TABLE updates RENAME TO updates_legacy")
    conn.execute(updates_table_sql())
    for row in rows:
        conn.execute(
            """
            INSERT OR IGNORE INTO updates (
                id, country, source, source_tab, title, summary, date, link, category,
                fingerprint, first_seen_at, last_seen_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["country"],
                row["source"],
                row["source_tab"] or SOURCE_TAB_BY_SOURCE.get(row["source"]),
                row["title"],
                row["summary"],
                row["date"],
                row["link"],
                normalize_stored_category(row["category"], row["title"], row["summary"]),
                row["fingerprint"],
                row["first_seen_at"],
                row["last_seen_at"],
            ),
        )
    conn.execute("DROP TABLE updates_legacy")


def migrate_categories(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT id, source, source_tab, title, summary, category FROM updates").fetchall()
    for row in rows:
        normalized = FORCED_CATEGORY_BY_SOURCE.get(
            row["source"],
            normalize_stored_category(row["category"], row["title"], row["summary"]),
        )
        source_tab = row["source_tab"] or SOURCE_TAB_BY_SOURCE.get(row["source"])
        if normalized != row["category"] or source_tab != row["source_tab"]:
            conn.execute(
                "UPDATE updates SET category = ?, source_tab = ? WHERE id = ?",
                (normalized, source_tab, row["id"]),
            )


def upsert_updates(items: list[dict[str, Any]]) -> tuple[int, int]:
    now = utc_now_iso()
    inserted = 0
    updated = 0
    with connect() as conn:
        for item in items:
            existing = conn.execute(
                "SELECT id FROM updates WHERE fingerprint = ?",
                (item["fingerprint"],),
            ).fetchone()
            if existing:
                updated += 1
            else:
                inserted += 1
            conn.execute(
                """
                INSERT INTO updates (
                    country, source, source_tab, title, summary, date, link, category,
                    fingerprint, first_seen_at, last_seen_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(fingerprint) DO UPDATE SET
                    source_tab = excluded.source_tab,
                    summary = CASE
                        WHEN excluded.summary != '' THEN excluded.summary
                        ELSE updates.summary
                    END,
                    date = COALESCE(excluded.date, updates.date),
                    link = CASE
                        WHEN excluded.link != '' THEN excluded.link
                        ELSE updates.link
                    END,
                    category = excluded.category,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    item["country"],
                    item["source"],
                    item.get("source_tab"),
                    item["title"],
                    item.get("summary", ""),
                    item.get("date"),
                    item["link"],
                    normalize_stored_category(item["category"], item["title"], item.get("summary", "")),
                    item["fingerprint"],
                    now,
                    now,
                ),
            )
    return inserted, updated


def encode_tags(tags: list[str] | tuple[str, ...] | None) -> str:
    return ",".join(dict.fromkeys(tag.strip() for tag in (tags or []) if tag.strip()))


def decode_tags(value: str | None) -> list[str]:
    return [tag for tag in (value or "").split(",") if tag]


def upsert_newsletter(item: dict[str, Any]) -> dict[str, Any]:
    now = utc_now_iso()
    status = item.get("status") or "draft"
    published_at = item.get("published_at") or (now if status == "published" else None)
    newsletter_id = item.get("id")
    with connect() as conn:
        if newsletter_id:
            conn.execute(
                """
                UPDATE newsletters
                SET title = ?, summary = ?, html_body = ?, text_body = ?,
                    status = ?, published_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    item["title"],
                    item.get("summary", ""),
                    item.get("html_body", ""),
                    item.get("text_body", ""),
                    status,
                    published_at,
                    now,
                    newsletter_id,
                ),
            )
            row_id = int(newsletter_id)
        else:
            cursor = conn.execute(
                """
                INSERT INTO newsletters (
                    title, summary, html_body, text_body, status,
                    published_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["title"],
                    item.get("summary", ""),
                    item.get("html_body", ""),
                    item.get("text_body", ""),
                    status,
                    published_at,
                    now,
                    now,
                ),
            )
            row_id = int(cursor.lastrowid)
        row = conn.execute(
            """
            SELECT id, title, summary, html_body, text_body, status,
                   published_at, created_at, updated_at
            FROM newsletters
            WHERE id = ?
            """,
            (row_id,),
        ).fetchone()
    return dict(row)


def list_published_newsletters(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, title, summary, html_body, text_body, status,
                   published_at, created_at, updated_at
            FROM newsletters
            WHERE status = 'published' AND published_at IS NOT NULL
            ORDER BY published_at DESC, updated_at DESC
            LIMIT ? OFFSET ?
            """,
            (max(1, min(limit, 100)), max(0, offset)),
        ).fetchall()
    return [dict(row) for row in rows]


def weekly_digest_row(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    try:
        data["entries"] = json.loads(data.pop("entries_json") or "[]")
    except json.JSONDecodeError:
        data["entries"] = []
    return data


def upsert_weekly_digest(item: dict[str, Any]) -> dict[str, Any]:
    now = utc_now_iso()
    status = item.get("status") or "published"
    published_at = item.get("published_at") or (now if status == "published" else None)
    digest_id = item.get("digest_id") or f"weekly-digest-{int(datetime.now(timezone.utc).timestamp())}"
    entries_json = item.get("entries_json")
    if entries_json is None:
        entries_json = json.dumps(item.get("entries") or [], ensure_ascii=False)
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO weekly_digests (
                digest_id, title, summary, html_body, text_body, status,
                published_at, created_at, updated_at, item_count, department,
                digest_type, entries_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(digest_id) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                html_body = excluded.html_body,
                text_body = excluded.text_body,
                status = excluded.status,
                published_at = excluded.published_at,
                updated_at = excluded.updated_at,
                item_count = excluded.item_count,
                department = excluded.department,
                digest_type = excluded.digest_type,
                entries_json = excluded.entries_json
            """,
            (
                digest_id,
                item["title"],
                item.get("summary", ""),
                item.get("html_body", ""),
                item.get("text_body", ""),
                status,
                published_at,
                now,
                now,
                int(item.get("item_count") or len(item.get("entries") or [])),
                item.get("department", ""),
                item.get("digest_type", ""),
                entries_json,
            ),
        )
        row = conn.execute(
            """
            SELECT id, digest_id, title, summary, html_body, text_body, status,
                   published_at, created_at, updated_at, item_count, department,
                   digest_type, entries_json
            FROM weekly_digests
            WHERE digest_id = ?
            """,
            (digest_id,),
        ).fetchone()
    return weekly_digest_row(row)


def list_published_weekly_digests(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, digest_id, title, summary, html_body, text_body, status,
                   published_at, created_at, updated_at, item_count, department,
                   digest_type, entries_json
            FROM weekly_digests
            WHERE status = 'published' AND published_at IS NOT NULL
            ORDER BY published_at DESC, updated_at DESC
            LIMIT ? OFFSET ?
            """,
            (max(1, min(limit, 100)), max(0, offset)),
        ).fetchall()
    return [weekly_digest_row(row) for row in rows]


def upsert_legal_ai_updates(items: list[dict[str, Any]]) -> tuple[int, int]:
    now = utc_now_iso()
    inserted = 0
    updated = 0
    with connect() as conn:
        for item in items:
            existing = conn.execute(
                "SELECT id FROM legal_ai_updates WHERE fingerprint = ?",
                (item["fingerprint"],),
            ).fetchone()
            if existing:
                updated += 1
            else:
                inserted += 1
            conn.execute(
                """
                INSERT INTO legal_ai_updates (
                    source_id, source, region, source_type, category, tags, title, summary,
                    date, link, fingerprint, first_seen_at, last_seen_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(fingerprint) DO UPDATE SET
                    region = excluded.region,
                    source_type = excluded.source_type,
                    category = excluded.category,
                    tags = excluded.tags,
                    summary = CASE
                        WHEN excluded.summary != '' THEN excluded.summary
                        ELSE legal_ai_updates.summary
                    END,
                    date = COALESCE(excluded.date, legal_ai_updates.date),
                    link = CASE
                        WHEN excluded.link != '' THEN excluded.link
                        ELSE legal_ai_updates.link
                    END,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    item["source_id"],
                    item["source"],
                    item["region"],
                    item["source_type"],
                    item["category"],
                    encode_tags(item.get("tags")),
                    item["title"],
                    item.get("summary", ""),
                    item.get("date"),
                    item["link"],
                    item["fingerprint"],
                    now,
                    now,
                ),
            )
    return inserted, updated


def record_source_run(
    source_id: str,
    source: str,
    country: str,
    status: str,
    item_count: int,
    error: str | None = None,
) -> dict[str, Any]:
    fetched_at = utc_now_iso()
    error_text = error[:700] if error else None
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO source_runs (source_id, source, country, status, fetched_at, item_count, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (source_id, source, country, status, fetched_at, item_count, error_text),
        )
    return {
        "source_id": source_id,
        "source": source,
        "country": country,
        "status": status,
        "fetched_at": fetched_at,
        "item_count": item_count,
        "error": error_text,
    }


def list_legal_ai_updates(
    region: str | None = None,
    source_type: str | None = None,
    topic: str | None = None,
    q: str | None = None,
    limit: int = 80,
    offset: int = 0,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if region and region != "All":
        clauses.append("region = ?")
        params.append(region)
    if source_type and source_type != "All":
        clauses.append("category = ?")
        params.append(source_type)
    if topic and topic != "All":
        clauses.append("(',' || tags || ',') LIKE ?")
        params.append(f"%,{topic},%")
    if q:
        clauses.append("(title LIKE ? OR summary LIKE ? OR source LIKE ? OR category LIKE ? OR tags LIKE ?)")
        term = f"%{q.strip()}%"
        params.extend([term, term, term, term, term])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.extend([max(1, min(limit, 200)), max(0, offset)])
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                id, source_id, source, region, source_type, category, tags, title, summary,
                date, link, first_seen_at, last_seen_at,
                CASE WHEN first_seen_at >= ? THEN 1 ELSE 0 END AS is_new
            FROM legal_ai_updates
            {where}
            ORDER BY CASE WHEN date IS NULL THEN 1 ELSE 0 END, date DESC, first_seen_at DESC
            LIMIT ? OFFSET ?
            """,
            [cutoff.replace(microsecond=0).isoformat(), *params],
        ).fetchall()
    return [
        dict(row) | {"tags": decode_tags(row["tags"]), "country": row["region"], "is_new": bool(row["is_new"])}
        for row in rows
    ]


def list_updates(
    country: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    clauses, params = visible_update_clauses()
    if country and country != "All":
        clauses.append("country = ?")
        params.append(country)
    if category and category != "All":
        clauses.append("category = ?")
        params.append(category)
    if q:
        clauses.append("(title LIKE ? OR summary LIKE ? OR source LIKE ? OR source_tab LIKE ?)")
        term = f"%{q.strip()}%"
        params.extend([term, term, term, term])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.extend([max(1, min(limit, 200)), max(0, offset)])
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                id, country, source, source_tab, title, summary, date, link, category,
                first_seen_at, last_seen_at,
                CASE WHEN first_seen_at >= ? THEN 1 ELSE 0 END AS is_new
            FROM updates
            {where}
            ORDER BY CASE WHEN date IS NULL THEN 1 ELSE 0 END, date DESC, first_seen_at DESC
            LIMIT ? OFFSET ?
            """,
            [cutoff.replace(microsecond=0).isoformat(), *params],
        ).fetchall()
    return [present_update_row(row) for row in rows]


def get_stats() -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    cutoff_iso = cutoff.replace(microsecond=0).isoformat()
    update_clauses, update_params = visible_update_clauses()
    update_where = f"WHERE {' AND '.join(update_clauses)}" if update_clauses else ""
    new_where = f"WHERE first_seen_at >= ? {'AND ' + ' AND '.join(update_clauses) if update_clauses else ''}"
    with connect() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM updates {update_where}",
            update_params,
        ).fetchone()["c"]
        new_count = conn.execute(
            f"SELECT COUNT(*) AS c FROM updates {new_where}",
            [cutoff_iso, *update_params],
        ).fetchone()["c"]
        by_country = {
            row["country"]: row["c"]
            for row in conn.execute(
                f"SELECT country, COUNT(*) AS c FROM updates {update_where} GROUP BY country",
                update_params,
            )
        }
        by_category = {
            row["category"]: row["c"]
            for row in conn.execute(
                f"SELECT category, COUNT(*) AS c FROM updates {update_where} GROUP BY category",
                update_params,
            )
        }
        last_scan = conn.execute(
            "SELECT fetched_at FROM source_runs ORDER BY fetched_at DESC LIMIT 1"
        ).fetchone()
        source_runs = [
            dict(row)
            for row in conn.execute(
                """
                SELECT source_id, source, country, status, fetched_at, item_count, error
                FROM source_runs
                WHERE id IN (
                    SELECT MAX(id)
                    FROM source_runs
                    GROUP BY source_id
                )
                ORDER BY fetched_at DESC
                """
            ).fetchall()
        ]
    return {
        "total": total,
        "new_24h": new_count,
        "by_country": by_country,
        "by_category": by_category,
        "last_scan_at": last_scan["fetched_at"] if last_scan else None,
        "source_runs": source_runs,
        "database_path": str(Path(settings.database_path).resolve()),
    }
