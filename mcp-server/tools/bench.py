"""Bench tool — proxy for LiteBench FastAPI backend.

LiteBench must be running on port 8001 for benchmark operations to work.
This tool proxies requests to its local HTTP API.

Actions: health, endpoints_list, endpoint_create, endpoint_update, endpoint_delete,
         endpoint_models, suites_list, suite_create, suite_delete,
         case_create, case_update, case_delete,
         seed_defaults, seed_standard, seed_stress, seed_speed, seed_judgment,
         run_start, run_cancel, runs_list, run_get, run_delete,
         compare, export, help
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
import urllib.parse
from typing import Any

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import BENCH_API_URL

API_URL = BENCH_API_URL
TIMEOUT = 30
TIMEOUT_RUN = 10  # just starts the run, streaming is separate


def handle_bench(
    action: str,
    # endpoint fields
    endpoint_id: int | None = None,
    name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    is_active: bool | None = None,
    # suite / case fields
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
    # benchmark run fields
    run_id: int | None = None,
    model_id: str | None = None,
    model_name: str | None = None,
    is_thinking: bool | None = None,
    # compare / export
    run_ids: str | None = None,
    format: str | None = None,
) -> str:
    action = action.strip().lower()

    if action == "help":
        return """LiteBench — LLM Benchmark Studio
Port: 8001

HEALTH
  health                — Check if LiteBench backend is running.

ENDPOINTS
  endpoints_list        — List all configured LLM endpoints.
  endpoint_create       — Add a new endpoint. params: name, base_url, [api_key]
  endpoint_update       — Update an endpoint. params: endpoint_id, [name], [base_url], [api_key], [is_active]
  endpoint_delete       — Delete an endpoint. params: endpoint_id
  endpoint_models       — Discover models from an endpoint. params: endpoint_id

SUITES
  suites_list           — List all test suites with their cases.
  suite_create          — Create a new test suite. params: name, [description]
  suite_delete          — Delete a suite and all its cases. params: suite_id

CASES
  case_create           — Add a test case to a suite. params: suite_id, test_id, category, name,
                          system_prompt, user_prompt, [eval_keywords], [eval_anti], [eval_json],
                          [eval_sentence_count], [eval_regex], [eval_min_length], max_tokens, [sort_order]
  case_update           — Update a test case. params: suite_id, case_id, [any case fields]
  case_delete           — Delete a test case. params: suite_id, case_id

SEED SUITES
  seed_defaults         — Seed the 10-test default benchmark suite.
  seed_standard         — Seed the 25-test standard suite.
  seed_stress           — Seed the 15-test stress suite (long-form, 2000-4000 tokens).
  seed_speed            — Seed the 10-test speed suite (fast, 150-300 tokens).
  seed_judgment         — Seed the 12-test judgment suite.

BENCHMARK RUNS
  run_start             — Start a benchmark run. params: endpoint_id, suite_id, model_id, [model_name], [is_thinking]
                          NOTE: Returns run_id immediately. Connect to SSE stream in browser for live results.
  run_cancel            — Cancel an active run. params: run_id
  runs_list             — List all benchmark runs.
  run_get               — Get a run with full results. params: run_id
  run_delete            — Delete a run and its results. params: run_id

COMPARE & EXPORT
  compare               — Compare multiple runs side-by-side. params: run_ids (comma-separated, e.g. "1,2,3")
  export                — Export a run. params: run_id, [format] (json|csv|md, default: json)

NOTE: LiteBench backend must be running on port 8001.
      SSE streaming cannot be proxied through sync MCP — use the browser UI for live results."""

    if action == "health":
        return _get_health()

    if not _is_available():
        return (
            "[LiteBench not available]\n"
            "LiteBench backend must be running on port 8001.\n"
            "Start it with: cd C:\\Projects\\LiteBench\\backend && uvicorn main:app --reload --port 8001\n\n"
            "Then retry this action."
        )

    # --- endpoints ---
    if action == "endpoints_list":
        return _get("/api/endpoints")

    if action == "endpoint_create":
        if not name or not base_url:
            return "Error: 'name' and 'base_url' are required for endpoint_create."
        body: dict[str, Any] = {"name": name, "base_url": base_url}
        if api_key is not None:
            body["api_key"] = api_key
        return _post("/api/endpoints", body)

    if action == "endpoint_update":
        if endpoint_id is None:
            return "Error: 'endpoint_id' is required for endpoint_update."
        body = {}
        if name is not None:
            body["name"] = name
        if base_url is not None:
            body["base_url"] = base_url
        if api_key is not None:
            body["api_key"] = api_key
        if is_active is not None:
            body["is_active"] = is_active
        return _put(f"/api/endpoints/{endpoint_id}", body)

    if action == "endpoint_delete":
        if endpoint_id is None:
            return "Error: 'endpoint_id' is required for endpoint_delete."
        return _delete(f"/api/endpoints/{endpoint_id}")

    if action == "endpoint_models":
        if endpoint_id is None:
            return "Error: 'endpoint_id' is required for endpoint_models."
        return _get(f"/api/endpoints/{endpoint_id}/models")

    # --- suites ---
    if action == "suites_list":
        return _get("/api/suites")

    if action == "suite_create":
        if not name:
            return "Error: 'name' is required for suite_create."
        body = {"name": name}
        if description is not None:
            body["description"] = description
        return _post("/api/suites", body)

    if action == "suite_delete":
        if suite_id is None:
            return "Error: 'suite_id' is required for suite_delete."
        return _delete(f"/api/suites/{suite_id}")

    # --- cases ---
    if action == "case_create":
        if suite_id is None:
            return "Error: 'suite_id' is required for case_create."
        if not test_id or not category or not name or not system_prompt or not user_prompt or max_tokens is None:
            return "Error: case_create requires suite_id, test_id, category, name, system_prompt, user_prompt, max_tokens."
        body = {
            "test_id": test_id,
            "category": category,
            "name": name,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "max_tokens": max_tokens,
        }
        if eval_keywords is not None:
            body["eval_keywords"] = eval_keywords
        if eval_anti is not None:
            body["eval_anti"] = eval_anti
        if eval_json is not None:
            body["eval_json"] = eval_json
        if eval_sentence_count is not None:
            body["eval_sentence_count"] = eval_sentence_count
        if eval_regex is not None:
            body["eval_regex"] = eval_regex
        if eval_min_length is not None:
            body["eval_min_length"] = eval_min_length
        if sort_order is not None:
            body["sort_order"] = sort_order
        return _post(f"/api/suites/{suite_id}/cases", body)

    if action == "case_update":
        if suite_id is None or case_id is None:
            return "Error: 'suite_id' and 'case_id' are required for case_update."
        body = {}
        for field, val in [
            ("test_id", test_id), ("category", category), ("name", name),
            ("system_prompt", system_prompt), ("user_prompt", user_prompt),
            ("eval_keywords", eval_keywords), ("eval_anti", eval_anti),
            ("eval_json", eval_json), ("eval_sentence_count", eval_sentence_count),
            ("eval_regex", eval_regex), ("eval_min_length", eval_min_length),
            ("max_tokens", max_tokens), ("sort_order", sort_order),
        ]:
            if val is not None:
                body[field] = val
        return _put(f"/api/suites/{suite_id}/cases/{case_id}", body)

    if action == "case_delete":
        if suite_id is None or case_id is None:
            return "Error: 'suite_id' and 'case_id' are required for case_delete."
        return _delete(f"/api/suites/{suite_id}/cases/{case_id}")

    # --- seed ---
    if action == "seed_defaults":
        return _post("/api/suites/seed-defaults", {})

    if action == "seed_standard":
        return _post("/api/suites/seed-standard", {})

    if action == "seed_stress":
        return _post("/api/suites/seed-stress", {})

    if action == "seed_speed":
        return _post("/api/suites/seed-speed", {})

    if action == "seed_judgment":
        return _post("/api/suites/seed-judgment", {})

    if action == "seed_creator":
        return _post("/api/suites/seed-creator", {})

    # --- benchmark runs ---
    if action == "run_start":
        if endpoint_id is None or suite_id is None or not model_id:
            return "Error: 'endpoint_id', 'suite_id', and 'model_id' are required for run_start."
        body = {
            "endpoint_id": endpoint_id,
            "suite_id": suite_id,
            "model_id": model_id,
        }
        if model_name is not None:
            body["model_name"] = model_name
        if is_thinking is not None:
            body["is_thinking"] = is_thinking
        result = _post_raw("/api/benchmarks/run", body, timeout=TIMEOUT_RUN)
        if isinstance(result, str):
            return result  # error string
        run_id_new = result.get("run_id")
        status = result.get("status", "unknown")
        return (
            f"Benchmark run started.\n"
            f"  run_id: {run_id_new}\n"
            f"  status: {status}\n\n"
            f"NOTE: Connect to the LiteBench UI (http://localhost:5174) to watch live SSE progress.\n"
            f"      SSE streaming cannot be proxied through sync MCP.\n"
            f"      Use run_get action to poll completion status."
        )

    if action == "run_cancel":
        if run_id is None:
            return "Error: 'run_id' is required for run_cancel."
        return _post(f"/api/benchmarks/cancel/{run_id}", {})

    if action == "runs_list":
        return _get("/api/benchmarks/runs")

    if action == "run_get":
        if run_id is None:
            return "Error: 'run_id' is required for run_get."
        return _get(f"/api/benchmarks/runs/{run_id}")

    if action == "run_delete":
        if run_id is None:
            return "Error: 'run_id' is required for run_delete."
        return _delete(f"/api/benchmarks/runs/{run_id}")

    # --- compare & export ---
    if action == "compare":
        if not run_ids:
            return "Error: 'run_ids' is required for compare (comma-separated, e.g. '1,2,3')."
        encoded = urllib.parse.urlencode({"run_ids": run_ids})
        return _get(f"/api/compare?{encoded}")

    if action == "export":
        if run_id is None:
            return "Error: 'run_id' is required for export."
        fmt = format or "json"
        encoded = urllib.parse.urlencode({"format": fmt})
        return _get(f"/api/export/runs/{run_id}?{encoded}", raw_text=(fmt in ("csv", "md")))

    return (
        f"Unknown action '{action}'. Use action='help' for the full list.\n"
        "Actions: health, endpoints_list, endpoint_create, endpoint_update, endpoint_delete, "
        "endpoint_models, suites_list, suite_create, suite_delete, case_create, case_update, "
        "case_delete, seed_defaults, seed_standard, seed_stress, seed_speed, seed_judgment, "
        "run_start, run_cancel, runs_list, run_get, run_delete, compare, export, help"
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _api_get(path: str, timeout: int = TIMEOUT) -> Any:
    """GET request to LiteBench API. Returns parsed JSON."""
    req = urllib.request.Request(f"{API_URL}{path}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _api_get_text(path: str, timeout: int = TIMEOUT) -> str:
    """GET request to LiteBench API. Returns raw text (for CSV/MD exports)."""
    req = urllib.request.Request(f"{API_URL}{path}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode()


def _api_post(path: str, body: dict, timeout: int = TIMEOUT) -> Any:
    """POST request to LiteBench API. Returns parsed JSON."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw.strip() else {}


def _api_put(path: str, body: dict, timeout: int = TIMEOUT) -> Any:
    """PUT request to LiteBench API. Returns parsed JSON."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw.strip() else {}


def _api_delete(path: str, timeout: int = TIMEOUT) -> int:
    """DELETE request to LiteBench API. Returns HTTP status code."""
    req = urllib.request.Request(f"{API_URL}{path}", method="DELETE")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status


def _is_available() -> bool:
    """Check if LiteBench backend is reachable."""
    try:
        result = _api_get("/api/health", timeout=3)
        return result.get("status") == "ok"
    except Exception:
        return False


def _get_health() -> str:
    """Get health status from LiteBench."""
    try:
        result = _api_get("/api/health")
    except Exception:
        return (
            "LiteBench status: NOT RUNNING\n\n"
            "Start it with: cd C:\\Projects\\LiteBench\\backend && uvicorn main:app --reload --port 8001"
        )
    status = result.get("status", "unknown")
    service = result.get("service", "litebench")
    return f"LiteBench status: {status.upper()} ({service})"


def _get(path: str, raw_text: bool = False) -> str:
    """Perform a GET and format the result as a pretty-printed string."""
    try:
        if raw_text:
            return _api_get_text(path)
        result = _api_get(path)
        return json.dumps(result, indent=2)
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return f"Error {e.code}: {body or e.reason}"
    except urllib.error.URLError as e:
        return f"Request failed: {e}"
    except Exception as e:
        return f"Request failed: {e}"


def _post(path: str, body: dict) -> str:
    """Perform a POST and format the result as a pretty-printed string."""
    try:
        result = _api_post(path, body)
        return json.dumps(result, indent=2) if result else "OK"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        return f"Error {e.code}: {err_body or e.reason}"
    except urllib.error.URLError as e:
        return f"Request failed: {e}"
    except Exception as e:
        return f"Request failed: {e}"


def _post_raw(path: str, body: dict, timeout: int = TIMEOUT) -> dict | str:
    """Perform a POST and return the parsed dict, or an error string."""
    try:
        return _api_post(path, body, timeout=timeout)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        return f"Error {e.code}: {err_body or e.reason}"
    except urllib.error.URLError as e:
        return f"Request failed: {e}"
    except Exception as e:
        return f"Request failed: {e}"


def _put(path: str, body: dict) -> str:
    """Perform a PUT and format the result as a pretty-printed string."""
    try:
        result = _api_put(path, body)
        return json.dumps(result, indent=2) if result else "OK"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        return f"Error {e.code}: {err_body or e.reason}"
    except urllib.error.URLError as e:
        return f"Request failed: {e}"
    except Exception as e:
        return f"Request failed: {e}"


def _delete(path: str) -> str:
    """Perform a DELETE and return a status string."""
    try:
        status = _api_delete(path)
        if status == 204:
            return "Deleted successfully."
        return f"Deleted (HTTP {status})."
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        return f"Error {e.code}: {err_body or e.reason}"
    except urllib.error.URLError as e:
        return f"Request failed: {e}"
    except Exception as e:
        return f"Request failed: {e}"
