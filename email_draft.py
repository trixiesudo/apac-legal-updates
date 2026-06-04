from __future__ import annotations

import html
import shutil
import subprocess
import tempfile
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Callable


Launcher = Callable[..., Any]


def build_email_subject(generated_at: datetime | None = None) -> str:
    generated_at = generated_at or datetime.now().astimezone()
    date_label = generated_at.strftime("%d %b %Y")
    return f"APAC Legal Updates - {date_label}"


def esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def item_value(item: Any, field: str) -> Any:
    if isinstance(item, dict):
        return item.get(field)
    return getattr(item, field, None)


def count_badge(label: str, value: Any, color: str = "#0f5f7a") -> str:
    return f"""
    <td style="padding:8px 10px;border:1px solid #d7dddd;border-radius:6px;background:#ffffff;">
      <div style="font-size:11px;text-transform:uppercase;color:#5f6b70;font-weight:700;">{esc(label)}</div>
      <div style="font-size:22px;color:{color};font-weight:800;">{esc(value)}</div>
    </td>
    """


def chip(label: str, color: str = "#eef1f1", ink: str = "#344047") -> str:
    if not label:
        return ""
    return (
        f'<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 8px;'
        f'border-radius:999px;background:{color};color:{ink};font-size:11px;'
        f'font-weight:700;">{esc(label)}</span>'
    )


def build_update_row(item: Any, index: int) -> str:
    country = item_value(item, "country")
    category = item_value(item, "category")
    source = item_value(item, "source")
    source_tab = item_value(item, "source_tab")
    title = item_value(item, "title")
    summary = item_value(item, "summary")
    link = item_value(item, "link")
    date = item_value(item, "date")
    source_label = " / ".join(esc(part) for part in (source_tab, source) if part)
    meta = (
        chip(country, "#e8eef7", "#214b79")
        + chip(category, "#eef1f1", "#344047")
        + (chip(source_tab, "#f4ead7", "#764c15") if source_tab else "")
    )
    return f"""
    <tr>
      <td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #d7dddd;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px 12px;">
              <div style="font-size:12px;color:#5f6b70;font-weight:700;margin-bottom:6px;">{index}. {esc(date)}</div>
              <div>{meta}</div>
              <div style="font-size:18px;line-height:1.3;font-weight:800;color:#101820;margin-top:3px;">
                <a href="{esc(link)}" style="color:#101820;text-decoration:none;">{esc(title)}</a>
              </div>
              <div style="font-size:14px;line-height:1.45;color:#20282f;margin-top:8px;">{esc(summary)}</div>
              <div style="font-size:12px;line-height:1.4;color:#5f6b70;margin-top:10px;">{source_label}</div>
              <div style="font-size:12px;line-height:1.4;margin-top:4px;">
                <a href="{esc(link)}" style="color:#0f5f7a;">Open source</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    """


def build_dashboard_email_html(updates: list[Any], generated_at: datetime | None = None) -> str:
    generated_at = generated_at or datetime.now().astimezone()
    countries = Counter(item_value(item, "country") for item in updates if item_value(item, "country"))
    categories = Counter(item_value(item, "category") for item in updates if item_value(item, "category"))
    date_label = generated_at.strftime("%d %b %Y")
    rows = "\n".join(build_update_row(item, index) for index, item in enumerate(updates, start=1))
    country_summary = ", ".join(f"{country}: {count}" for country, count in countries.most_common()) or "None"
    category_summary = ", ".join(f"{category}: {count}" for category, count in categories.most_common()) or "None"

    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f5;font-family:Arial,Helvetica,sans-serif;color:#101820;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f4f5f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="760" cellspacing="0" cellpadding="0" style="width:760px;max-width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:22px 24px;background:#101820;border-radius:10px 10px 0 0;">
                <div style="font-size:12px;letter-spacing:0;text-transform:uppercase;color:#f2bac2;font-weight:800;">Review and send manually</div>
                <div style="font-size:28px;line-height:1.2;color:#ffffff;font-weight:800;margin-top:6px;">APAC Legal Updates</div>
                <div style="font-size:14px;color:#dbe5ea;margin-top:6px;">Dashboard draft for {esc(date_label)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px;background:#e9eeed;border-left:1px solid #d7dddd;border-right:1px solid #d7dddd;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px;">
                  <tr>
                    {count_badge("Updates", len(updates), "#b52133")}
                    {count_badge("Jurisdictions", len(countries))}
                    {count_badge("Categories", len(categories), "#2f7a4f")}
                  </tr>
                </table>
                <div style="font-size:12px;color:#5f6b70;line-height:1.5;margin:6px 8px 0;">
                  <strong>Jurisdiction mix:</strong> {esc(country_summary)}<br>
                  <strong>Category mix:</strong> {esc(category_summary)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 14px 4px;background:#f4f5f5;border-left:1px solid #d7dddd;border-right:1px solid #d7dddd;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  {rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#ffffff;border:1px solid #d7dddd;border-top:0;border-radius:0 0 10px 10px;font-size:12px;color:#5f6b70;line-height:1.45;">
                This draft was generated locally from the APAC Legal Updates dashboard. Please review all content and recipients before sending.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def powershell_script_text() -> str:
    return r"""
param(
  [Parameter(Mandatory=$true)][string]$SubjectPath,
  [Parameter(Mandatory=$true)][string]$BodyPath
)

$ErrorActionPreference = "Stop"
$subject = Get-Content -LiteralPath $SubjectPath -Raw -Encoding UTF8
$body = Get-Content -LiteralPath $BodyPath -Raw -Encoding UTF8

try {
  $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
  $outlook = New-Object -ComObject Outlook.Application
}

$mail = $outlook.CreateItem(0)
$mail.Subject = $subject
$mail.HTMLBody = $body
[void]$mail.Display($false)

if ($mail -ne $null) {
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($mail)
}
if ($outlook -ne $null) {
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook)
}
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
"""


def cleanup_old_draft_dirs(max_age_seconds: int = 86_400) -> None:
    temp_root = Path(tempfile.gettempdir())
    cutoff = time.time() - max_age_seconds
    for path in temp_root.glob("apac-legal-draft-*"):
        try:
            if path.is_dir() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            continue


def open_outlook_draft(subject: str, html_body: str, launcher: Launcher = subprocess.Popen) -> dict[str, Any]:
    cleanup_old_draft_dirs()
    tmp_path = Path(tempfile.mkdtemp(prefix="apac-legal-draft-"))
    subject_path = tmp_path / "subject.txt"
    body_path = tmp_path / "body.html"
    script_path = tmp_path / "open_outlook_draft.ps1"
    subject_path.write_text(subject, encoding="utf-8")
    body_path.write_text(html_body, encoding="utf-8")
    script_path.write_text(powershell_script_text(), encoding="utf-8")

    command = [
        "powershell.exe",
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script_path),
        str(subject_path),
        str(body_path),
    ]
    try:
        process = launcher(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            close_fds=True,
        )
    except Exception:
        shutil.rmtree(tmp_path, ignore_errors=True)
        raise

    return {
        "status": "opening",
        "pid": getattr(process, "pid", None),
    }
