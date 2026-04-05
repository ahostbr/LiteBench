"""Web search tool — DuckDuckGo search, no API key required.

Actions: search, news, help
"""

from __future__ import annotations
import json
from typing import Any


def handle_web_search(
    action: str,
    query: str | None = None,
    max_results: int = 10,
    region: str = "wt-wt",
) -> str:
    action = action.strip().lower()

    if action == "help":
        return """Web Search — DuckDuckGo (no API key)

Actions:
  search   — Search the web. params: query, [max_results=10], [region=wt-wt]
  news     — Search recent news. params: query, [max_results=10]
  help     — Show this help.

Regions: wt-wt (worldwide), us-en, uk-en, de-de, fr-fr, etc."""

    if not query:
        return "Error: 'query' is required."

    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            return "Error: ddgs not installed. Run: pip install ddgs"

    if action == "search":
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results, region=region))
            if not results:
                return f"No results for: {query}"
            lines = [f"## Search: {query}\n"]
            for i, r in enumerate(results, 1):
                lines.append(f"**{i}. [{r.get('title', '')}]({r.get('href', '')})**")
                lines.append(f"   {r.get('body', '')}\n")
            return "\n".join(lines)
        except Exception as e:
            return f"Search failed: {e}"

    if action == "news":
        try:
            with DDGS() as ddgs:
                results = list(ddgs.news(query, max_results=max_results))
            if not results:
                return f"No news for: {query}"
            lines = [f"## News: {query}\n"]
            for i, r in enumerate(results, 1):
                lines.append(f"**{i}. [{r.get('title', '')}]({r.get('url', '')})**")
                lines.append(f"   {r.get('body', '')}")
                lines.append(f"   Source: {r.get('source', '')} | {r.get('date', '')}\n")
            return "\n".join(lines)
        except Exception as e:
            return f"News search failed: {e}"

    return f"Unknown action '{action}'. Use action='help' for options."
