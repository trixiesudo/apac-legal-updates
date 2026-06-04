from __future__ import annotations

import argparse
from pathlib import Path

from app.database import init_db, upsert_newsletter


def read_optional(path: str | None) -> str:
    return Path(path).read_text(encoding="utf-8") if path else ""


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update a published APAC Legal Updates newsletter.")
    parser.add_argument("--id", type=int, default=None, help="Existing newsletter id to update.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--html-file", default=None)
    parser.add_argument("--text-file", default=None)
    parser.add_argument("--status", default="published", choices=["draft", "published"])
    parser.add_argument("--published-at", default=None, help="ISO timestamp. Defaults to now for published newsletters.")
    args = parser.parse_args()

    init_db()
    newsletter = upsert_newsletter(
        {
            "id": args.id,
            "title": args.title,
            "summary": args.summary,
            "html_body": read_optional(args.html_file),
            "text_body": read_optional(args.text_file),
            "status": args.status,
            "published_at": args.published_at,
        }
    )
    print(f"Newsletter {newsletter['id']} saved with status={newsletter['status']}")


if __name__ == "__main__":
    main()
