"""
LiteBench MCP Server
====================
Standalone MCP server for LiteBench — the LLM Benchmark Studio.

Tools:
  bench       — Benchmark management (endpoints, suites, runs, compare, export)
  web_search  — DuckDuckGo web search (no API key)
  web_fetch   — Fetch and extract text from URLs
  youtube     — YouTube transcript and video info via yt-dlp

Transport: stdio (default) or SSE
"""

from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from typing import Any
from fastmcp import FastMCP
from config import SERVER_TRANSPORT, SERVER_PORT

mcp = FastMCP(
    "LiteBench",
    instructions=(
        "LiteBench MCP server — 4 tools for benchmarking local LLMs. "
        "Pass action='help' to any tool for its full action list.\n\n"
        "Tools:\n"
        "  bench      — Manage endpoints, test suites, benchmark runs, comparisons\n"
        "  web_search — Search the web via DuckDuckGo (no API key needed)\n"
        "  web_fetch  — Fetch and extract text from any URL\n"
        "  youtube    — Get YouTube video transcripts and metadata\n\n"
        "The bench tool requires LiteBench backend running on port 8001.\n"
        "Start it with: cd backend && uvicorn main:app --port 8001"
    ),
)


# ── Tool 1: bench ─────────────────────────────────────────────────────────────

@mcp.tool()
def bench(
    action: str,
    endpoint_id: int | None = None,
    name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    is_active: bool | None = None,
    suite_id: int | None = None,
    case_id: int | None = None,
    description: str | None = None,
    test_id: str | None = None,
    category: str | None = None,
    system_prompt: str | None = None,
    user_prompt: str | None = None,
    eval_keywords: list[str] | None = None,
    eval_anti: list[str] | None = None,
    eval_json: bool | None = None,
    eval_sentence_count: int | None = None,
    eval_regex: list[str] | None = None,
    eval_min_length: int | None = None,
    max_tokens: int | None = None,
    sort_order: int | None = None,
    run_id: int | None = None,
    model_id: str | None = None,
    model_name: str | None = None,
    is_thinking: bool | None = None,
    run_ids: str | None = None,
    format: str | None = None,
) -> str:
    """
    LiteBench benchmark management — endpoints, suites, runs, compare, export.

    Actions: health, endpoints_list, endpoint_create, endpoint_update, endpoint_delete,
             endpoint_models, suites_list, suite_create, suite_delete,
             case_create, case_update, case_delete,
             seed_defaults, seed_standard, seed_stress, seed_speed, seed_judgment, seed_creator,
             run_start, run_cancel, runs_list, run_get, run_delete,
             compare, export, help

    Use action='help' for full documentation.
    """
    from tools.bench import handle_bench
    return handle_bench(
        action, endpoint_id=endpoint_id, name=name, base_url=base_url,
        api_key=api_key, is_active=is_active, suite_id=suite_id, case_id=case_id,
        description=description, test_id=test_id, category=category,
        system_prompt=system_prompt, user_prompt=user_prompt,
        eval_keywords=eval_keywords, eval_anti=eval_anti, eval_json=eval_json,
        eval_sentence_count=eval_sentence_count, eval_regex=eval_regex,
        eval_min_length=eval_min_length, max_tokens=max_tokens, sort_order=sort_order,
        run_id=run_id, model_id=model_id, model_name=model_name,
        is_thinking=is_thinking, run_ids=run_ids, format=format,
    )


# ── Tool 2: web_search ────────────────────────────────────────────────────────

@mcp.tool()
def web_search(
    action: str,
    query: str | None = None,
    max_results: int = 10,
    region: str = "wt-wt",
) -> str:
    """
    Search the web via DuckDuckGo — no API key required.

    Actions: search, news, help

    Use action='help' for full documentation.
    """
    from tools.web_search import handle_web_search
    return handle_web_search(action, query=query, max_results=max_results, region=region)


# ── Tool 3: web_fetch ─────────────────────────────────────────────────────────

@mcp.tool()
def web_fetch(
    action: str,
    url: str | None = None,
    max_length: int = 50_000,
) -> str:
    """
    Fetch a URL and extract text content (HTML stripped).

    Actions: fetch, fetch_raw, help

    Use action='help' for full documentation.
    """
    from tools.web_fetch import handle_web_fetch
    return handle_web_fetch(action, url=url, max_length=max_length)


# ── Tool 4: youtube ───────────────────────────────────────────────────────────

@mcp.tool()
def youtube(
    action: str,
    url: str | None = None,
) -> str:
    """
    YouTube video transcripts and metadata via yt-dlp.

    Actions: transcript, info, help

    Use action='help' for full documentation.
    """
    from tools.youtube import handle_youtube
    return handle_youtube(action, url=url)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if SERVER_TRANSPORT == "sse":
        mcp.run(transport="sse", port=SERVER_PORT)
    else:
        mcp.run(transport="stdio")
