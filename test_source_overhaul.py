from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app import config, database, fetcher, legal_ai_fetcher, models, source_summary  # noqa: E402


class FakeResponse:
    def __init__(self, html: str, status_code: int = 200, headers: dict | None = None, json_body: dict | None = None) -> None:
        self.content = html.encode("utf-8")
        self.status_code = status_code
        self.headers = headers or {"content-type": "text/html; charset=utf-8"}
        self._json_body = json_body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")
        return None

    def json(self) -> dict:
        return self._json_body or {}


class FakeClient:
    def __init__(self, html: str, fail_get: bool = False, fail_post: bool = False) -> None:
        self.html = html
        self.fail_get = fail_get
        self.fail_post = fail_post
        self.requests: list[dict] = []
        self.posts: list[dict] = []

    async def get(self, url: str, **kwargs) -> FakeResponse:
        self.requests.append({"url": url, **kwargs})
        if self.fail_get:
            raise RuntimeError("source connection failed")
        return FakeResponse(self.html)

    async def post(self, url: str, **kwargs) -> FakeResponse:
        self.posts.append({"url": url, **kwargs})
        if self.fail_post:
            raise RuntimeError("local AI connection failed")
        if url.endswith("/api/generate"):
            return FakeResponse(
                "",
                json_body={
                    "response": "Local AI summary: phased commencement, audit duties and transitional arrangements."
                },
            )
        return FakeResponse(
            "",
            json_body={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "AI summary: phased commencement, audit duties and transitional arrangements.",
                            }
                        ],
                    }
                ]
            },
        )


class SourceOverhaulTests(unittest.TestCase):
    def test_primary_categories_use_legal_news_taxonomy(self) -> None:
        self.assertEqual(
            config.PRIMARY_CATEGORIES,
            [
                "Press Release/Judiciary Updates",
                "Case Summary",
                "Recent Judgments",
                "Policy/Regulatory News",
                "Legal News",
                "Legislation News",
            ],
        )

    def test_political_legislative_assembly_story_is_not_legal_relevant(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "my_fmt_nation")

        item = fetcher.to_item(
            source,
            "Negeri Sembilan DAP man plays down last-minute PH meeting",
            "State DAP secretary Cha Kee Chin says the gathering was a regular meeting despite being called at short notice following the dissolution of the Johor state legislative assembly.",
            "2026-06-02",
            "https://www.freemalaysiatoday.com/category/nation/2026/06/02/dap-meeting/",
        )

        self.assertIsNone(item)

    def test_fmt_uses_direct_cms_feed_and_browser_rss_headers(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "my_fmt_nation")

        self.assertEqual(source.url, "https://cms.freemalaysiatoday.com/category/nation/feed")
        headers = fetcher.request_headers_for_source(source)
        self.assertIsNotNone(headers)
        self.assertIn("Chrome", headers["User-Agent"])
        self.assertIn("application/rss+xml", headers["Accept"])

    def test_existing_political_legislative_assembly_story_is_hidden(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_updates(
                    [
                        {
                            "country": "Malaysia",
                            "source": "Free Malaysia Today - Nation",
                            "source_tab": "News Sources",
                            "title": "Negeri Sembilan DAP man plays down last-minute PH meeting",
                            "summary": "State DAP secretary Cha Kee Chin says the gathering was a regular meeting despite being called at short notice following the dissolution of the Johor state legislative assembly.",
                            "date": "2026-06-02",
                            "link": "https://www.freemalaysiatoday.com/category/nation/2026/06/02/dap-meeting/",
                            "category": "Legislation News",
                            "fingerprint": "political-legislative-assembly",
                        }
                    ]
                )

                self.assertEqual(database.list_updates(limit=5), [])
            finally:
                database.settings = original_settings

    def test_policy_news_is_classified_separately_from_legal_news(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "sg_lawwatch_headlines")

        item = fetcher.to_item(
            source,
            "'Capital guaranteed' label for investment-linked policies misleading: MAS, Life Insurance Association",
            "Business Times / 02 Jun 2026 'Capital guaranteed' label for investment-linked policies misleading; the death benefit of ILPs typically has a guaranteed component, but there is no capital guarantee.",
            "2026-06-02",
            "https://www.singaporelawwatch.sg/Headlines/capital-guaranteed-label-for-investment-linked-policies-misleading",
        )

        self.assertIsNotNone(item)
        self.assertEqual(item["category"], "Policy/Regulatory News")

    def test_existing_policy_news_is_migrated_to_policy_category(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_updates(
                    [
                        {
                            "country": "Singapore",
                            "source": "Singapore Law Watch Headlines",
                            "source_tab": "News Sources",
                            "title": "'Capital guaranteed' label for investment-linked policies misleading: MAS, Life Insurance Association",
                            "summary": "Business Times / 02 Jun 2026 'Capital guaranteed' label for investment-linked policies misleading; the death benefit of ILPs typically has a guaranteed component, but there is no capital guarantee.",
                            "date": "2026-06-02",
                            "link": "https://www.singaporelawwatch.sg/Headlines/capital-guaranteed-label-for-investment-linked-policies-misleading",
                            "category": "Legal News",
                            "fingerprint": "policy-existing-row",
                        }
                    ]
                )

                database.init_db()
                rows = database.list_updates(q="Capital guaranteed", limit=5)

                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]["category"], "Policy/Regulatory News")
            finally:
                database.settings = original_settings

    def test_old_category_normalizes_to_legal_news(self) -> None:
        self.assertEqual(database.normalize_category("Court News/Legal News"), "Legal News")
        self.assertEqual(database.normalize_category("Legal News"), "Legal News")
        self.assertEqual(database.normalize_category(None), "Legal News")

    def test_source_catalog_is_workbook_only_and_has_no_all_country(self) -> None:
        self.assertEqual(len(config.SOURCES), 43)
        self.assertIn("India", config.COUNTRIES)
        self.assertNotIn("All", {source.country for source in config.SOURCES})
        self.assertTrue(all(source.category in config.PRIMARY_CATEGORIES for source in config.SOURCES))

    def test_malaysia_and_singapore_legislation_sources_are_configured(self) -> None:
        sources = {source.id: source for source in config.SOURCES}
        malaysia = sources["my_lom_whats_new"]
        self.assertEqual(malaysia.country, "Malaysia")
        self.assertEqual(malaysia.name, "Laws of Malaysia - What's New")
        self.assertEqual(malaysia.url, "https://lom.agc.gov.my/index.php")
        self.assertEqual(malaysia.category, "Legislation News")
        self.assertEqual(malaysia.source_tab, "Laws of Malaysia")
        self.assertTrue(malaysia.official)
        self.assertTrue(malaysia.include_all)

        singapore = sources["sg_sso_new_legislation"]
        self.assertEqual(singapore.country, "Singapore")
        self.assertEqual(singapore.name, "Singapore Statutes Online - New Legislation")
        self.assertEqual(singapore.url, "https://sso.agc.gov.sg/What's-New/New-Legislation/RSS")
        self.assertEqual(singapore.source_type, "rss")
        self.assertEqual(singapore.category, "Legislation News")
        self.assertEqual(singapore.source_tab, "Singapore Statutes Online")
        self.assertTrue(singapore.official)
        self.assertTrue(singapore.include_all)

    def test_india_sources_are_real_configured_sources_without_seeded_updates(self) -> None:
        india_sources = [source for source in config.SOURCES if source.country == "India"]
        self.assertEqual(len(india_sources), 13)
        self.assertEqual(
            {source.name for source in india_sources},
            {
                "Ministry of Law & Justice Press Releases",
                "India Code",
                "Gazette of India",
                "PRS Legislative Research",
                "Supreme Court of India",
                "Reserve Bank of India Notifications",
                "SEBI RSS Feed",
                "MeitY Notifications",
                "Competition Commission of India Press Releases",
                "Insolvency and Bankruptcy Board of India Updates",
                "LiveLaw",
                "Bar & Bench",
                "SCC Online Blog",
            },
        )
        self.assertTrue(all(source.url.startswith("https://") for source in india_sources))
        self.assertTrue(any(source.source_type == "rss" for source in india_sources))
        self.assertTrue(any(source.source_type == "html" for source in india_sources))
        self.assertTrue(all(source.source_tab for source in india_sources))

        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                self.assertEqual(database.list_updates(country="India", limit=5), [])
            finally:
                database.settings = original_settings

    def test_legal_ai_sources_are_separate_real_sources(self) -> None:
        self.assertEqual(len(config.LEGAL_AI_NEWS_SOURCES), 15)
        self.assertTrue(all(source.content_group == "legal_ai_news" for source in config.LEGAL_AI_NEWS_SOURCES))
        self.assertTrue(all(source.url.startswith("https://") for source in config.LEGAL_AI_NEWS_SOURCES))
        self.assertTrue(all(source.ingestion_method in {"rss", "api", "scraper", "manual", "pending"} for source in config.LEGAL_AI_NEWS_SOURCES))
        self.assertTrue(any(source.ingestion_method == "scraper" for source in config.LEGAL_AI_NEWS_SOURCES))
        self.assertTrue(all("legal_ai" in source.tags or "legal_tech" in source.tags or "ai_regulation" in source.tags for source in config.LEGAL_AI_NEWS_SOURCES))
        self.assertFalse(any(source.name == "Artificial Lawyer" for source in config.SOURCES))
        self.assertIn(
            "Artificial Lawyer",
            {source.name for source in config.LEGAL_AI_NEWS_SOURCES},
        )
        self.assertIn(
            "EU Artificial Intelligence Act",
            {source.name for source in config.LEGAL_AI_NEWS_SOURCES},
        )

    def test_legal_ai_api_exposes_sources_and_updates_route(self) -> None:
        from app.main import app
        from fastapi.testclient import TestClient

        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                with TestClient(app) as client:
                    source_response = client.get("/api/legal-ai/sources")
                    self.assertEqual(source_response.status_code, 200)
                    sources = source_response.json()
                    self.assertEqual(len(sources), 15)
                    self.assertEqual(sources[0]["content_group"], "legal_ai_news")
                    self.assertIn("tags", sources[0])
                    self.assertIn("ingestion_method", sources[0])

                    updates_response = client.get("/api/legal-ai/updates")
                    self.assertEqual(updates_response.status_code, 200)
                    self.assertEqual(updates_response.json(), [])
            finally:
                database.settings = original_settings

    def test_legal_ai_updates_can_be_stored_and_filtered_without_normal_updates(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                inserted, updated = database.upsert_legal_ai_updates(
                    [
                        {
                            "source_id": "ai_artificial_lawyer",
                            "source": "Artificial Lawyer",
                            "region": "global",
                            "source_type": "editorial/legal_ai_news",
                            "category": "Editorial",
                            "tags": ["legal_ai", "legal_tech"],
                            "title": "Legal AI platform launches for law firms",
                            "summary": "A real source headline about legal AI adoption.",
                            "date": "2026-05-25",
                            "link": "https://example.com/legal-ai",
                            "fingerprint": "legal-ai-test",
                        }
                    ]
                )
                self.assertEqual((inserted, updated), (1, 0))
                self.assertEqual(database.list_updates(limit=5), [])
                rows = database.list_legal_ai_updates(region="global", topic="legal_ai")
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]["title"], "Legal AI platform launches for law firms")
                self.assertEqual(rows[0]["tags"], ["legal_ai", "legal_tech"])
            finally:
                database.settings = original_settings

    def test_newsletters_store_returns_only_published_rows(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_newsletter(
                    {
                        "title": "Published APAC briefing",
                        "summary": "Published summary for public readers.",
                        "html_body": "<p>Published</p>",
                        "text_body": "Published",
                        "status": "published",
                        "published_at": "2026-06-04T09:00:00+00:00",
                    }
                )
                database.upsert_newsletter(
                    {
                        "title": "Draft APAC briefing",
                        "summary": "Draft summary should stay private.",
                        "html_body": "<p>Draft</p>",
                        "text_body": "Draft",
                        "status": "draft",
                    }
                )

                rows = database.list_published_newsletters()

                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]["title"], "Published APAC briefing")
                self.assertEqual(rows[0]["summary"], "Published summary for public readers.")
                self.assertNotIn("Draft APAC briefing", {row["title"] for row in rows})
            finally:
                database.settings = original_settings

    def test_weekly_digests_store_returns_only_published_rows(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_weekly_digest(
                    {
                        "digest_id": "digest-public",
                        "title": "Weekly APAC digest",
                        "summary": "Published digest summary.",
                        "html_body": "<p>Published weekly digest</p>",
                        "text_body": "Published weekly digest",
                        "status": "published",
                        "published_at": "2026-06-05T09:00:00+00:00",
                        "item_count": 3,
                        "department": "PAL (Practice Area Lead)",
                        "digest_type": "Weekly Executive Digest",
                        "entries_json": '[{"title":"Signal"}]',
                    }
                )
                database.upsert_weekly_digest(
                    {
                        "digest_id": "digest-draft",
                        "title": "Draft weekly digest",
                        "summary": "Draft summary should stay private.",
                        "html_body": "<p>Draft</p>",
                        "text_body": "Draft",
                        "status": "draft",
                        "item_count": 1,
                    }
                )

                rows = database.list_published_weekly_digests()

                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]["digest_id"], "digest-public")
                self.assertEqual(rows[0]["title"], "Weekly APAC digest")
                self.assertEqual(rows[0]["item_count"], 3)
                self.assertEqual(rows[0]["entries"], [{"title": "Signal"}])
                self.assertNotIn("Draft weekly digest", {row["title"] for row in rows})
            finally:
                database.settings = original_settings

    def test_weekly_digest_api_allows_publish_and_public_list(self) -> None:
        from app import main
        from fastapi.testclient import TestClient

        original_database_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                with TestClient(main.app) as client:
                    publish_response = client.post(
                        "/api/admin/weekly-digests/publish",
                        json={
                            "digest_id": "digest-api",
                            "title": "Weekly digest from local",
                            "summary": "Rendered on GitHub Pages.",
                            "html_body": "<p>Rendered on GitHub Pages.</p>",
                            "text_body": "Rendered on GitHub Pages.",
                            "item_count": 2,
                            "department": "Legislation Team",
                            "digest_type": "Weekly Executive Digest",
                            "entries": [{"title": "Legislation signal"}],
                        },
                    )
                    self.assertEqual(publish_response.status_code, 200)
                    self.assertEqual(publish_response.json()["status"], "published")

                    list_response = client.get("/api/weekly-digests")
                    self.assertEqual(list_response.status_code, 200)
                    self.assertEqual(list_response.json()[0]["digest_id"], "digest-api")
                    self.assertEqual(list_response.json()[0]["entries"], [{"title": "Legislation signal"}])

                    delete_response = client.delete("/api/admin/weekly-digests/digest-api")
                    self.assertEqual(delete_response.status_code, 200)
                    self.assertEqual(delete_response.json()["status"], "deleted")
                    self.assertEqual(client.get("/api/weekly-digests").json(), [])
            finally:
                database.settings = original_database_settings

    def test_newsletter_api_allows_delete_for_published_admin(self) -> None:
        from app import main
        from fastapi.testclient import TestClient

        original_database_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                with TestClient(main.app) as client:
                    publish_response = client.post(
                        "/api/admin/newsletters/publish",
                        json={
                            "title": "Published newsletter for deletion",
                            "summary": "Delete from admin tab.",
                            "html_body": "<p>Delete from admin tab.</p>",
                            "text_body": "Delete from admin tab.",
                            "status": "published",
                        },
                    )
                    self.assertEqual(publish_response.status_code, 200)
                    newsletter_id = publish_response.json()["id"]

                    delete_response = client.delete(f"/api/admin/newsletters/{newsletter_id}")

                    self.assertEqual(delete_response.status_code, 200)
                    self.assertEqual(delete_response.json()["status"], "deleted")
                    self.assertEqual(client.get("/api/newsletters").json(), [])
            finally:
                database.settings = original_database_settings

    def test_public_mode_exposes_newsletters_but_blocks_raw_feeds_and_outlook(self) -> None:
        from app import main
        from fastapi.testclient import TestClient

        original_database_settings = database.settings
        original_main_settings = main.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            main.settings = SimpleNamespace(
                public_mode=True,
                enable_scheduler=False,
                daily_run_hour=6,
                github_pages_origin="https://YOUR-GITHUB-USERNAME.github.io",
                cors_origins=[
                    "http://localhost:5174",
                    "http://127.0.0.1:5174",
                    "https://YOUR-GITHUB-USERNAME.github.io",
                ],
            )
            try:
                database.init_db()
                database.upsert_newsletter(
                    {
                        "title": "Published briefing",
                        "summary": "Only this public briefing is visible.",
                        "html_body": "<p>Visible</p>",
                        "text_body": "Visible",
                        "status": "published",
                        "published_at": "2026-06-04T09:00:00+00:00",
                    }
                )
                with TestClient(main.app) as client:
                    newsletters = client.get("/api/newsletters")
                    self.assertEqual(newsletters.status_code, 200)
                    self.assertEqual(newsletters.json()[0]["title"], "Published briefing")

                    self.assertEqual(client.get("/api/updates").status_code, 404)
                    self.assertEqual(client.get("/api/sources").status_code, 404)
                    self.assertEqual(client.get("/api/legal-ai/updates").status_code, 404)
                    self.assertEqual(
                        client.post(
                            "/api/draft-email",
                            json={
                                "updates": [
                                    {
                                        "title": "Published-only public mode",
                                        "summary": "This would otherwise open desktop Outlook.",
                                        "link": "https://example.test",
                                    }
                                ]
                            },
                        ).status_code,
                        404,
                    )
            finally:
                main.settings = original_main_settings
                database.settings = original_database_settings

    def test_legal_ai_scraper_extracts_real_source_rows_from_html(self) -> None:
        source = config.LegalAiNewsSource(
            id="ai_test",
            name="Test Legal AI Source",
            url="https://example.com/news",
            category="Editorial",
            source_type="editorial/legal_ai_news",
            region="global",
            tags=("legal_ai", "legal_tech"),
            ingestion_method="scraper",
            notes="Test source.",
        )
        html = """
        <html>
          <body>
            <article>
              <h2><a href="/post">Legal AI platform launches for law firms</a></h2>
              <time datetime="2026-05-25">25 May 2026</time>
              <p>Law firms are adopting a legal AI workflow for contract review.</p>
            </article>
          </body>
        </html>
        """

        items = asyncio.run(legal_ai_fetcher.fetch_legal_ai_html(FakeClient(html), source))

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Legal AI platform launches for law firms")
        self.assertEqual(items[0]["date"], "2026-05-25")
        self.assertEqual(items[0]["region"], "global")
        self.assertEqual(items[0]["category"], "Editorial")

    def test_hkba_blank_nation_source_is_hong_kong_with_source_tab(self) -> None:
        hkba_sources = [source for source in config.SOURCES if "hkba.org" in source.url]
        self.assertEqual(len(hkba_sources), 1)
        self.assertEqual(hkba_sources[0].country, "Hong Kong")
        self.assertEqual(hkba_sources[0].category, "Legal News")
        self.assertEqual(hkba_sources[0].source_tab, "HKBA")

    def test_law_asia_source_detects_country_per_item(self) -> None:
        source = next(
            (source for source in config.SOURCES if "law.asia/category/asia-business-law-journal" in source.url),
            None,
        )
        self.assertIsNotNone(source)
        self.assertTrue(source.country_detection)
        detect_country_for_item = getattr(fetcher, "detect_country_for_item", lambda _text: None)
        samples = {
            "Malaysia court reform and Kuala Lumpur legal market": "Malaysia",
            "Singapore Ministry of Law announces arbitration changes": "Singapore",
            "Hong Kong judiciary and HKIAC legal update": "Hong Kong",
            "Australia High Court and ASIC enforcement update": "Australia",
            "New Zealand law society issues Auckland practice note": "New Zealand",
            "India competition law update": "India",
        }
        for text, expected in samples.items():
            with self.subTest(text=text):
                self.assertEqual(detect_country_for_item(text), expected)

    def test_cna_source_is_always_legal_news(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "sg_cna_judiciary")
        self.assertEqual(
            fetcher.detect_category(
                source,
                "IN FOCUS: 1 in 3 new lawyers want out",
                "After the Chief Justice's wake-up call about junior lawyers, CNA talks to young associates.",
            ),
            "Legal News",
        )

    def test_commercial_sale_and_advertisement_items_are_filtered(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "sg_lawwatch_headlines")

        sale_items = [
            (
                "ADV: Open for Pre-sale: Singapore Rules of Court: A Practice Guide (2026 Edition)",
                "Academy Publishing / 16 May 2026 ADV: Open for Pre-sale: Singapore Rules of Court: A Practice Guide",
                "https://store.lawnet.com/publications-category/publications-products/law-books/law-practice-series/singapore-rules-of-court-a-practice-guide-2026-edition.html?utm_id=ap_roc2026",
            ),
            (
                "ADV: TechLaw.Fest 2026 - Snag your early bird tickets (till 30 June)",
                "Singapore Academy of Law / 12 May 2026 Returning for its 11th edition.",
                "https://www.techlawfest.com/event/3f8e5e89-3b85-4860-bf50-d6524cb457e4/home",
            ),
            (
                "ADV: JLP Essential Skills - Legal Innovation | 26 May | 7 CPD Points",
                "Understand legal innovation and apply legal tech tools in practice.",
                "https://store.lawnet.com/jlp-legal-innovation-apr-2026.html?utm_id=lpd_jlp_legalinnov",
            ),
        ]
        for title, summary, link in sale_items:
            with self.subTest(title=title):
                self.assertIsNone(fetcher.to_item(source, title, summary, "2026-05-16", link))

        judgment = fetcher.to_item(
            next(source for source in config.SOURCES if source.id == "sg_judiciary_judgments"),
            "TAN HUAT CHAN v WU LEE CHOO",
            "[Land — Sale of land — Sale under court order] Decision Date: 13 May 2026",
            "2026-05-13",
            "https://www.elitigation.sg/gd/s/2026_SGHCA_15",
        )
        self.assertIsNotNone(judgment)

    def test_opinion_and_forum_items_are_filtered(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "sg_lawwatch_headlines")

        editorial_items = [
            (
                "Asia has a three-year window to seize AI leadership through digital sovereignty: Opinion",
                "Business Times / 03 Jun 2026 Asia has a three-year window to seize AI leadership through digital sovereignty: Opinion To stay competitive, Asia must rethink digital and engineer trust into the architecture of AI systems, says the writer.",
            ),
            (
                "Sole objective of removing PayNow nicknames is to address impersonation scams: Forum",
                "Straits Times / 03 Jun 2026 Sole objective of removing PayNow nicknames is to address impersonation scams: Forum The sole objective of the removal of PayNow nicknames is to address impersonation scams.",
            ),
        ]

        for title, summary in editorial_items:
            with self.subTest(title=title):
                self.assertIsNone(
                    fetcher.to_item(
                        source,
                        title,
                        summary,
                        "2026-06-03",
                        "https://www.singaporelawwatch.sg/Headlines/editorial-item",
                    )
                )

    def test_existing_opinion_and_forum_items_are_hidden(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_updates(
                    [
                        {
                            "country": "Singapore",
                            "source": "Singapore Law Watch Headlines",
                            "source_tab": "News Sources",
                            "title": "Asia has a three-year window to seize AI leadership through digital sovereignty: Opinion",
                            "summary": "Business Times / 03 Jun 2026 Asia has a three-year window to seize AI leadership through digital sovereignty: Opinion To stay competitive, Asia must rethink digital and engineer trust into the architecture of AI systems, says the writer.",
                            "date": "2026-06-03",
                            "link": "https://www.singaporelawwatch.sg/Headlines/opinion",
                            "category": "Legal News",
                            "fingerprint": "opinion-existing-row",
                        },
                        {
                            "country": "Singapore",
                            "source": "Singapore Law Watch Headlines",
                            "source_tab": "News Sources",
                            "title": "Sole objective of removing PayNow nicknames is to address impersonation scams: Forum",
                            "summary": "Straits Times / 03 Jun 2026 Sole objective of removing PayNow nicknames is to address impersonation scams: Forum The sole objective of the removal of PayNow nicknames is to address impersonation scams.",
                            "date": "2026-06-03",
                            "link": "https://www.singaporelawwatch.sg/Headlines/forum",
                            "category": "Legal News",
                            "fingerprint": "forum-existing-row",
                        },
                    ]
                )

                self.assertEqual(database.list_updates(limit=5), [])
            finally:
                database.settings = original_settings

    def test_malaysian_bar_legal_news_scrapes_dated_headlines_only(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "my_bar_legal_news")
        self.assertIn("/list/news/legal-and-general-news/legal-news", source.url)

        html = """
        <html>
          <body>
            <ul class="dropdown">
              <li><a href="/list/news/agms-and-egms">AGMs and EGMs</a></li>
              <li><a href="/list/news/in-memoriam">In Memoriam</a></li>
            </ul>
            <form id="legacy-wrapper">
              <div id="div_section">
                <h1>Legal News</h1>
                <ul class="list-home">
                  <li>
                    <a href="/article/news/legal-and-general-news/legal-news/cla-statement">
                      <span class="greytxt">17/04/2026</span>
                      <p>CLA Statement on the United Nations General Assembly Resolution on the Transatlantic Slave Trade (10 Apr 2026)</p>
                    </a>
                  </li>
                  <li>
                    <a href="/article/news/legal-and-general-news/legal-news/iba-news-release">
                      <span class="greytxt">03/04/2026</span>
                      <p>IBA News Release | IBA Publishes New Report on the Digital Nomad Phenomenon and Its Implications for Multinational Organisations (2 Apr 2026)</p>
                    </a>
                  </li>
                </ul>
              </div>
            </form>
          </body>
        </html>
        """

        items = asyncio.run(fetcher.fetch_html(FakeClient(html), source))

        self.assertEqual(
            [item["title"] for item in items],
            [
                "CLA Statement on the United Nations General Assembly Resolution on the Transatlantic Slave Trade (10 Apr 2026)",
                "IBA News Release | IBA Publishes New Report on the Digital Nomad Phenomenon and Its Implications for Multinational Organisations (2 Apr 2026)",
            ],
        )
        self.assertEqual([item["date"] for item in items], ["2026-04-17", "2026-04-03"])
        self.assertTrue(all(item["source_tab"] == "Malaysian Bar" for item in items))
        self.assertNotIn("AGMs and EGMs", {item["title"] for item in items})

    def test_unreachable_source_with_prior_items_is_reported_as_stale(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "my_bar_legal_news")
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_updates(
                    [
                        {
                            "country": "Malaysia",
                            "source": source.name,
                            "source_tab": source.source_tab,
                            "title": "High Court grants injunction in commercial dispute",
                            "summary": "The High Court granted interim relief in pending legal proceedings.",
                            "date": "2026-04-17",
                            "link": "https://www.malaysianbar.org.my/article/news/legal-and-general-news/legal-news/injunction",
                            "category": "Legal News",
                            "fingerprint": "malaysian-bar-prior-item",
                        }
                    ]
                )

                items, run = asyncio.run(fetcher.fetch_source(FakeClient("", fail_get=True), source))

                self.assertEqual(items, [])
                self.assertEqual(run["status"], "stale")
                self.assertEqual(run["item_count"], 1)
                self.assertIn("previously indexed item", run["error"])
                self.assertIn("source connection failed", run["error"])
            finally:
                database.settings = original_settings

    def test_requested_malaysian_bar_sources_are_configured(self) -> None:
        sources = {source.id: source for source in config.SOURCES}
        requested = {
            "my_bar_bar_news": (
                "Malaysian Bar - Bar News",
                "https://www.malaysianbar.org.my/list/news/bar-news/news",
                "Legal News",
            ),
            "my_bar_appellate_courts": (
                "Malaysian Bar - Appellate Courts Highlights",
                "https://www.malaysianbar.org.my/list/news/highlights-from-the-appellate-courts/highlights-from-the-appellate-courts",
                "Legal News",
            ),
            "my_bar_notices": (
                "Malaysian Bar - Notices",
                "https://www.malaysianbar.org.my/list/news/bar-news/notices",
                "Press Release/Judiciary Updates",
            ),
        }

        for source_id, (name, url, category) in requested.items():
            with self.subTest(source_id=source_id):
                source = sources[source_id]
                self.assertEqual(source.country, "Malaysia")
                self.assertEqual(source.name, name)
                self.assertEqual(source.url, url)
                self.assertEqual(source.source_type, "html")
                self.assertEqual(source.category, category)
                self.assertEqual(source.source_tab, "Malaysian Bar")
                self.assertTrue(source.include_all)
                self.assertEqual(source.item_selector, "ul.list-home > li")
                self.assertEqual(source.title_selector, "p")
                self.assertEqual(source.link_selector, "a[href]")
                self.assertEqual(source.summary_selector, "p")
                self.assertEqual(source.date_selector, ".greytxt")
                self.assertTrue(source.require_date)

    def test_laws_of_malaysia_whats_new_scrapes_legislation_items(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "my_lom_whats_new")
        current_year = datetime.now(timezone.utc).year
        html = """
        <html>
          <body>
            <nav><a href="/index.php">Home</a><a href="/principal">Updated</a></nav>
            <section id="what-new">
              <h3>What's New</h3>
              <h4>Today</h4>
              <p>There is no record to display</p>
              <h4>26 May</h4>
              <strong>Principal Act</strong>
              <a href="/act-view.php?type=principal&lang=BI&act=881">881 - INTERNATIONAL SETTLEMENT AGREEMENTS RESULTING FROM MEDIATION ACT 2026</a>
              <a href="/act-view.php?type=principal&lang=BI&act=882">882 - GOVERNMENT PROCUREMENT ACT 2026</a>
              <strong>P.U. (A)</strong>
              <a href="/pu-view.php?type=pua&lang=BI&no=202">P.U. (A) 202/2026 - CONTROL OF SUPPLIES (CONTROLLED ARTICLES) (NO. 3) ORDER 2026</a>
              <h4>25 May</h4>
              <p>There is no record to display</p>
            </section>
            <section>
              <h4>Top Hit (All Time)</h4>
              <a href="/constitution">FEDERAL CONSTITUTION</a>
            </section>
          </body>
        </html>
        """

        items = asyncio.run(fetcher.fetch_html(FakeClient(html), source))

        self.assertEqual(
            [item["title"] for item in items],
            [
                "881 - INTERNATIONAL SETTLEMENT AGREEMENTS RESULTING FROM MEDIATION ACT 2026",
                "882 - GOVERNMENT PROCUREMENT ACT 2026",
                "P.U. (A) 202/2026 - CONTROL OF SUPPLIES (CONTROLLED ARTICLES) (NO. 3) ORDER 2026",
            ],
        )
        self.assertEqual([item["date"] for item in items], [f"{current_year}-05-26"] * 3)
        self.assertTrue(all(item["country"] == "Malaysia" for item in items))
        self.assertTrue(all(item["source"] == "Laws of Malaysia - What's New" for item in items))
        self.assertTrue(all(item["source_tab"] == "Laws of Malaysia" for item in items))
        self.assertTrue(all(item["category"] == "Legislation News" for item in items))
        self.assertFalse(any("FEDERAL CONSTITUTION" in item["title"] for item in items))

    def test_singapore_statutes_new_legislation_rss_items_are_updates(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "sg_sso_new_legislation")
        rss = """
        <?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0">
          <channel>
            <title>New Legislation</title>
            <item>
              <title>Road Traffic (Traffic Signs) (Amendment No. 3) Rules 2026</title>
              <link>https://sso.agc.gov.sg/SL-Supp/S342-2026/Published/20260514?DocDate=20260514</link>
              <description>Published on Singapore Statutes Online.</description>
              <pubDate>Thu, 14 May 2026 12:00:00 +0800</pubDate>
            </item>
          </channel>
        </rss>
        """

        items = asyncio.run(fetcher.fetch_rss(FakeClient(rss), source))

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["country"], "Singapore")
        self.assertEqual(items[0]["source"], "Singapore Statutes Online - New Legislation")
        self.assertEqual(items[0]["source_tab"], "Singapore Statutes Online")
        self.assertEqual(items[0]["category"], "Legislation News")
        self.assertEqual(items[0]["date"], "2026-05-14")
        self.assertEqual(items[0]["title"], "Road Traffic (Traffic Signs) (Amendment No. 3) Rules 2026")

    def test_singapore_statutes_new_legislation_uses_browser_user_agent(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "sg_sso_new_legislation")
        client = FakeClient(
            """
            <rss version="2.0">
              <channel>
                <item>
                  <title>Goods and Services Tax (Amendment) Regulations 2026</title>
                  <link>https://sso.agc.gov.sg/SL-Supp/S350-2026/Published/20260520?DocDate=20260520</link>
                  <pubDate>Wed, 20 May 2026 12:00:00 +0800</pubDate>
                </item>
              </channel>
            </rss>
            """
        )

        items = asyncio.run(fetcher.fetch_rss(client, source))

        self.assertEqual(len(items), 1)
        self.assertIn("Mozilla/5.0", client.requests[0]["headers"]["User-Agent"])
        self.assertIn("application/rss+xml", client.requests[0]["headers"]["Accept"])

    def test_digest_source_summary_extracts_meaningful_page_text_for_openai(self) -> None:
        html = """
        <html>
          <head>
            <title>Ignored Browser Title</title>
            <meta name="description" content="The regulator published commencement details for the AI legal services rules.">
          </head>
          <body>
            <nav>Home Search Subscribe</nav>
            <main>
              <h1>AI Legal Services Rules commence in stages</h1>
              <p>The new rules set out provider governance duties, audit trail requirements and model disclosure obligations for legal technology systems.</p>
              <p>Implementation starts on 1 July 2026, with transitional arrangements for existing platforms.</p>
            </main>
            <footer>Contact us</footer>
          </body>
        </html>
        """

        text = source_summary.extract_source_content(
            html.encode("utf-8"),
            "text/html; charset=utf-8",
            "https://example.test/legal-update",
            "AI rules update",
        )

        self.assertIn("AI Legal Services Rules commence in stages", text)
        self.assertIn("provider governance duties", text)
        self.assertNotIn("Home Search Subscribe", text)
        self.assertLessEqual(len(text), source_summary.MAX_SOURCE_CONTENT_CHARS)

    def test_digest_content_summary_removes_model_preamble(self) -> None:
        summary = source_summary.clean_ai_summary_output(
            """
            Here are two concise factual sentences summarizing the changes:

            * The regulator published phased commencement dates for the AI legal services rules.
            * Existing providers must keep audit trails and disclose model governance controls.
            """
        )

        self.assertEqual(
            summary,
            "The regulator published phased commencement dates for the AI legal services rules. Existing providers must keep audit trails and disclose model governance controls.",
        )
        self.assertNotIn("Here are two concise", summary)
        self.assertNotIn("*", summary)

    def test_digest_content_summary_uses_openai_responses_api(self) -> None:
        html = """
        <html>
          <body>
            <main>
              <h1>AI Legal Services Rules commence in stages</h1>
              <p>The new rules set out provider governance duties, audit trail requirements and model disclosure obligations for legal technology systems.</p>
              <p>Implementation starts on 1 July 2026, with transitional arrangements for existing platforms.</p>
            </main>
          </body>
        </html>
        """
        client = FakeClient(html)

        result = asyncio.run(
            source_summary.summarize_source_item(
                client,
                {
                    "item_id": "ai-rules",
                    "title": "AI Legal Services Rules commence in stages",
                    "link": "https://example.test/legal-update",
                    "source": "Official Gazette",
                    "jurisdiction": "Singapore",
                    "category": "Legislation News",
                },
                api_key="test-key",
                model="gpt-5.4-nano",
                provider="openai",
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["summary"],
            "phased commencement, audit duties and transitional arrangements.",
        )
        self.assertEqual(client.posts[0]["url"], source_summary.OPENAI_RESPONSES_URL)
        self.assertEqual(client.posts[0]["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(client.posts[0]["json"]["model"], "gpt-5.4-nano")
        self.assertIn("provider governance duties", client.posts[0]["json"]["input"])

    def test_digest_content_summary_uses_ollama_without_openai_key(self) -> None:
        html = """
        <html>
          <body>
            <main>
              <h1>AI Legal Services Rules commence in stages</h1>
              <p>The new rules set out provider governance duties, audit trail requirements and model disclosure obligations for legal technology systems.</p>
              <p>Implementation starts on 1 July 2026, with transitional arrangements for existing platforms.</p>
            </main>
          </body>
        </html>
        """
        client = FakeClient(html)

        result = asyncio.run(
            source_summary.summarize_source_item(
                client,
                {
                    "item_id": "local-ai-rules",
                    "title": "AI Legal Services Rules commence in stages",
                    "link": "https://example.test/legal-update",
                    "source": "Official Gazette",
                    "jurisdiction": "Singapore",
                    "category": "Legislation News",
                },
                api_key="",
                model="llama3.2:1b",
                provider="ollama",
                local_base_url="http://127.0.0.1:11434",
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["summary"],
            "phased commencement, audit duties and transitional arrangements.",
        )
        self.assertEqual(client.posts[0]["url"], "http://127.0.0.1:11434/api/generate")
        self.assertEqual(client.posts[0]["json"]["model"], "llama3.2:1b")
        self.assertFalse(client.posts[0]["json"]["stream"])
        self.assertIn("provider governance duties", client.posts[0]["json"]["prompt"])

    def test_digest_content_summary_auto_uses_ollama_without_openai_key(self) -> None:
        client = FakeClient("<html><main><p>Readable legal update content with enough detail for summarisation.</p></main></html>")

        result = asyncio.run(
            source_summary.summarize_source_item(
                client,
                {
                    "item_id": "missing-key",
                    "title": "Readable legal update",
                    "link": "https://example.test/legal-update",
                    "source": "Official Gazette",
                },
                api_key="",
                provider="auto",
                local_base_url="http://127.0.0.1:11434",
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(client.posts[0]["url"], "http://127.0.0.1:11434/api/generate")

    def test_digest_content_summary_auto_falls_back_when_ollama_is_down(self) -> None:
        html = """
        <html>
          <body>
            <main>
              <h1>AI Legal Services Rules commence in stages</h1>
              <p>The new rules set out provider governance duties, audit trail requirements and model disclosure obligations for legal technology systems.</p>
              <p>Implementation starts on 1 July 2026, with transitional arrangements for existing platforms.</p>
            </main>
          </body>
        </html>
        """
        client = FakeClient(html, fail_post=True)

        result = asyncio.run(
            source_summary.summarize_source_item(
                client,
                {
                    "item_id": "local-ai-down",
                    "title": "AI Legal Services Rules commence in stages",
                    "link": "https://example.test/legal-update",
                    "source": "Official Gazette",
                    "jurisdiction": "Singapore",
                    "category": "Legislation News",
                },
                api_key="",
                provider="auto",
                local_base_url="http://127.0.0.1:11434",
                model="llama3.2:1b",
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertIn("provider governance duties", result["summary"])
        self.assertIn("Implementation starts on 1 July 2026", result["summary"])
        self.assertIsNone(result["error"])

    def test_digest_content_summary_falls_back_when_explicit_ollama_is_down(self) -> None:
        client = FakeClient(
            """
            <html>
              <body>
                <main>
                  <p>The new notification updates the authorised entry and departure rates for immigration processing.</p>
                  <p>Public agencies may need to update workflow guidance and fee references before commencement.</p>
                </main>
              </body>
            </html>
            """,
            fail_post=True,
        )

        result = asyncio.run(
            source_summary.summarize_source_item(
                client,
                {
                    "item_id": "explicit-local-ai-down",
                    "title": "Immigration rates notification",
                    "link": "https://example.test/legal-update",
                    "source": "Official Gazette",
                    "jurisdiction": "Malaysia",
                    "category": "Legislation News",
                },
                api_key="",
                provider="ollama",
                local_base_url="http://127.0.0.1:11434",
                model="llama3.1:8b",
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertIn("authorised entry and departure rates", result["summary"])
        self.assertIn("workflow guidance and fee references", result["summary"])
        self.assertIsNone(result["error"])

    def test_digest_content_summary_falls_back_to_ingested_summary_when_source_fetch_fails(self) -> None:
        client = FakeClient("", fail_get=True)

        result = asyncio.run(
            source_summary.summarize_source_item(
                client,
                {
                    "item_id": "fallback-source",
                    "title": "AI Legal Services Rules commence in stages",
                    "summary": "The update says implementation starts on 1 July 2026 with audit trail and model disclosure duties.",
                    "link": "https://example.test/legal-update",
                    "source": "Official Gazette",
                    "jurisdiction": "Singapore",
                    "category": "Legislation News",
                },
                api_key="",
                provider="ollama",
                local_base_url="http://127.0.0.1:11434",
                model="llama3.2:1b",
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertIn("implementation starts on 1 July 2026", client.posts[0]["json"]["prompt"])

    def test_supreme_court_of_india_recent_judgments_are_scraped_from_homepage(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "in_supreme_court_judgments")
        self.assertEqual(source.url, "https://www.sci.gov.in/")
        html = """
        <html>
          <body>
            <h4>Judgments</h4>
            <ul>
              <li>
                <a href="/sci-get-pdf/?diary_no=71622026&from=latest_judgements_order&type=j">
                  NANDKISHORE MISHRA VS. THE STATE OF MADHYA PRADESH - Crl.A. No. 2787/2026 - Diary Number 7162 / 2026 - 22-May-2026 (Uploaded On 23-05-2026 13:23:55)
                </a>
              </li>
              <li>
                <a href="/sci-get-pdf/?diary_no=495502023&from=latest_judgements_order&type=j">
                  BHIKHUBHAI GOVINDBHAI PATEL VS. THE STATE OF GUJARAT - Crl.A. No. 2792/2026 - Diary Number 49550 / 2023 - 22-May-2026 (Uploaded On 23-05-2026 13:15:20)
                </a>
              </li>
            </ul>
            <h4>Orders</h4>
            <ul>
              <li>
                <a href="/sci-get-pdf/?diary_no=299892026&from=latest_judgements_order&type=o">
                  AKASH GOPAL REVANKAR VS. STATE OF HARYANA - SLP(Crl) No. 9451/2026 - Diary Number 29989 / 2026 - 21-May-2026 (Uploaded On 23-05-2026 15:28:49)
                </a>
              </li>
            </ul>
          </body>
        </html>
        """

        items = asyncio.run(fetcher.fetch_html(FakeClient(html), source))

        self.assertEqual(
            [item["title"] for item in items],
            [
                "NANDKISHORE MISHRA VS. THE STATE OF MADHYA PRADESH - Crl.A. No. 2787/2026 - Diary Number 7162 / 2026 - 22-May-2026 (Uploaded On 23-05-2026 13:23:55)",
                "BHIKHUBHAI GOVINDBHAI PATEL VS. THE STATE OF GUJARAT - Crl.A. No. 2792/2026 - Diary Number 49550 / 2023 - 22-May-2026 (Uploaded On 23-05-2026 13:15:20)",
            ],
        )
        self.assertEqual([item["date"] for item in items], ["2026-05-22", "2026-05-22"])
        self.assertTrue(all(item["category"] == "Recent Judgments" for item in items))
        self.assertTrue(all(item["country"] == "India" for item in items))
        self.assertNotIn("AKASH GOPAL REVANKAR VS. STATE OF HARYANA", {item["title"] for item in items})

    def test_gazette_of_india_scrapes_rows_not_listing_page_text(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "in_gazette")
        html = """
        <html>
          <body>
            <nav>Gazettes on Demand Bills & Acts Election & Bye-Election Land Acquisition Delhi Master Plan</nav>
            <section class="card">
              <h3>Recent Extra Ordinary Gazettes</h3>
              <table>
                <tr>
                  <th>Ministry</th><th>Subject</th><th>Publish Date</th><th>Gazette ID</th><th>Download</th>
                </tr>
                <tr>
                  <td>Ministry of Railways</td>
                  <td>Publication of Gazette Notification declaring land acquisition for rail corridor</td>
                  <td>23-May-2026</td>
                  <td>CG-BR-E-23052026-272838</td>
                  <td><a href="/ViewPDF.aspx?id=272838">Download</a> 0.5 MB</td>
                </tr>
                <tr>
                  <td>Ministry of Ports, Shipping and Waterways</td>
                  <td>Merchant Shipping National Shipping Board Rules</td>
                  <td>23-May-2026</td>
                  <td>CG-DL-E-23052026-272836</td>
                  <td><a href="/ViewPDF.aspx?id=272836">Download</a> 0.65 MB</td>
                </tr>
              </table>
            </section>
          </body>
        </html>
        """

        items = asyncio.run(fetcher.fetch_html(FakeClient(html), source))

        self.assertEqual(
            [item["title"] for item in items],
            [
                "Ministry of Railways Publication of Gazette Notification declaring land acquisition for rail corridor",
                "Ministry of Ports, Shipping and Waterways Merchant Shipping National Shipping Board Rules",
            ],
        )
        self.assertEqual([item["date"] for item in items], ["2026-05-23", "2026-05-23"])
        self.assertTrue(all(item["link"].startswith("https://egazette.gov.in/ViewPDF.aspx") for item in items))
        self.assertFalse(any("Recent Extra Ordinary Gazettes" in item["title"] for item in items))
        self.assertFalse(any("Gazettes on Demand Bills" in item["summary"] for item in items))

    def test_gazette_of_india_rejects_aggregate_and_generic_rows(self) -> None:
        source = next(source for source in config.SOURCES if source.id == "in_gazette")
        self.assertIsNone(
            fetcher.to_item(
                source,
                "Department of Publication",
                "Gazettes on Demand Bills & Acts Election & Bye-Election Land Acquisition Delhi Master Plan Recent Extra Ordinary Gazettes Ministry Subject Publish Date Gazette ID Download Ministry of Railways Publication of Gazette Notification declaring... 23-May-2026 CG-BR-E-23052026-272838",
                "2026-05-23",
                "https://egazette.gov.in/",
            )
        )
        self.assertIsNone(
            fetcher.to_item(
                source,
                "Recent Extra Ordinary Gazettes Ministry Subject Publish Date Gazette ID Download Ministry of Railways Publication of Gazette Notification declaring... 23-May-2026 CG-BR-E-23052026-272838 0.5 MB Ministry of Ports, Shipping and Waterways Merchant Shipping National Shipping Board Rules 23-May-2026 CG-DL-E-23052026-272836 0.65 MB",
                "Recent Extra Ordinary Gazettes Ministry Subject Publish Date Gazette ID Download Ministry of Railways Publication of Gazette Notification declaring... 23-May-2026 CG-BR-E-23052026-272838 0.5 MB Ministry of Ports, Shipping and Waterways Merchant Shipping National Shipping Board Rules 23-May-2026 CG-DL-E-23052026-272836 0.65 MB",
                "2026-05-23",
                "https://egazette.gov.in/",
            )
        )

    def test_gazette_aggregate_rows_are_hidden_from_updates_api(self) -> None:
        original_settings = database.settings
        with tempfile.TemporaryDirectory() as tmp:
            database.settings = SimpleNamespace(database_path=Path(tmp) / "legal_updates.db")
            try:
                database.init_db()
                database.upsert_updates(
                    [
                        {
                            "country": "India",
                            "source": "Gazette of India",
                            "source_tab": "Gazette of India",
                            "title": "Department of Publication",
                            "summary": "Gazettes on Demand Bills & Acts Election & Bye-Election Land Acquisition Delhi Master Plan",
                            "date": "2026-05-23",
                            "link": "https://egazette.gov.in/",
                            "category": "Legislation News",
                            "fingerprint": "bad-gazette",
                        },
                        {
                            "country": "India",
                            "source": "Gazette of India",
                            "source_tab": "Gazette of India",
                            "title": "Ministry of Railways Publication of Gazette Notification declaring land acquisition 23-May-2026 CG-BR-E-23052026-272838 0.5 MB",
                            "summary": "Ministry of Railways Publication of Gazette Notification declaring land acquisition 23-May-2026 CG-BR-E-23052026-272838 0.5 MB",
                            "date": "2026-05-23",
                            "link": "https://egazette.gov.in/ViewPDF.aspx?id=272838",
                            "category": "Legislation News",
                            "fingerprint": "good-gazette",
                        },
                    ]
                )

                self.assertEqual(
                    [row["title"] for row in database.list_updates(country="India", limit=10)],
                    ["Ministry of Railways Publication of Gazette Notification declaring land acquisition"],
                )
                self.assertEqual(
                    database.list_updates(country="India", limit=10)[0]["summary"],
                    "Ministry of Railways Publication of Gazette Notification declaring land acquisition",
                )
            finally:
                database.settings = original_settings

    def test_updates_schema_and_api_models_include_source_tab(self) -> None:
        self.assertIn("source_tab TEXT", database.updates_table_sql())
        update = models.UpdateOut(
            id=1,
            country="Malaysia",
            source="Malaysian Bar",
            source_tab="Malaysian Bar",
            title="Test update",
            summary="Summary",
            date="2026-05-17",
            link="https://example.com",
            category="Legal News",
            first_seen_at="2026-05-17T00:00:00+00:00",
            last_seen_at="2026-05-17T00:00:00+00:00",
        )
        source = models.SourceOut(
            id="my_bar_legal_news",
            country="Malaysia",
            name="Malaysian Bar - Legal News",
            url="https://www.malaysianbar.org.my/list/news/legal-and-general-news/legal-news",
            source_type="html",
            category="Legal News",
            source_tab="Malaysian Bar",
            official=False,
            access_basis="Public access listing page",
        )
        self.assertIn("source_tab", update.model_dump())
        self.assertIn("source_tab", source.model_dump())
        self.assertEqual(update.model_dump()["source_tab"], "Malaysian Bar")
        self.assertEqual(source.model_dump()["source_tab"], "Malaysian Bar")


if __name__ == "__main__":
    unittest.main()
