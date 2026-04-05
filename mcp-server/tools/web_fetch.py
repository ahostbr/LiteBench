"""Web fetch tool — download and extract text from URLs.

Actions: fetch, fetch_raw, help
"""

from __future__ import annotations
import urllib.request
import urllib.error
import re
from typing import Any

MAX_CONTENT_LENGTH = 50_000  # 50K chars max


def _strip_html(html: str) -> str:
    """Simple HTML to text conversion."""
    try:
        import html2text
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        h.body_width = 0
        return h.handle(html)
    except ImportError:
        # Fallback: regex-based stripping
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text


def handle_web_fetch(
    action: str,
    url: str | None = None,
    max_length: int = MAX_CONTENT_LENGTH,
) -> str:
    action = action.strip().lower()

    if action == "help":
        return """Web Fetch — download and extract text from URLs.

Actions:
  fetch      — Fetch URL and return extracted text (HTML stripped). params: url, [max_length=50000]
  fetch_raw  — Fetch URL and return raw content. params: url, [max_length=50000]
  help       — Show this help."""

    if not url:
        return "Error: 'url' is required."

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiteBench/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return f"HTTP Error {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return f"URL Error: {e.reason}"
    except Exception as e:
        return f"Fetch failed: {e}"

    if action == "fetch_raw":
        if len(raw) > max_length:
            return raw[:max_length] + f"\n\n[Truncated at {max_length} chars, total {len(raw)}]"
        return raw

    if action == "fetch":
        if "html" in content_type.lower() or raw.strip().startswith("<"):
            text = _strip_html(raw)
        else:
            text = raw

        if len(text) > max_length:
            text = text[:max_length] + f"\n\n[Truncated at {max_length} chars]"
        return text

    return f"Unknown action '{action}'. Use action='help' for options."
