import json
import asyncio
import csv
import io
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
import aiosqlite
from sse_starlette.sse import EventSourceResponse, ServerSentEvent
from openai import OpenAI
from db import get_db
from models import BenchmarkRunRequest, BenchmarkRunOut, TestResultOut
from engine.runner import run_benchmark_stream

log = logging.getLogger("litebench")
log.setLevel(logging.DEBUG)
_fh = logging.FileHandler("C:/Projects/LiteBench/backend/litebench.log", mode="w")
_fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
log.addHandler(_fh)

router = APIRouter(tags=["benchmarks"])

# Active runs: run_id -> {"task": asyncio.Task, "cancelled": bool}
_active_runs: dict[int, dict] = {}


def _row_to_result(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "run_id": row["run_id"],
        "test_case_id": row["test_case_id"],
        "test_id": row["test_id"],
        "category": row["category"],
        "name": row["name"],
        "content": row["content"],
        "elapsed_s": row["elapsed_s"],
        "prompt_tokens": row["prompt_tokens"],
        "completion_tokens": row["completion_tokens"],
        "tokens_per_sec": row["tokens_per_sec"],
        "finish_reason": row["finish_reason"],
        "final_score": row["final_score"],
        "keyword_score": row["keyword_score"],
        "keyword_hits": json.loads(row["keyword_hits"]),
        "keyword_misses": json.loads(row["keyword_misses"]),
        "violations": json.loads(row["violations"]),
        "had_thinking": bool(row["had_thinking"]),
        "thinking_tokens_approx": row["thinking_tokens_approx"],
        "answer_length": row["answer_length"],
    }


def _row_to_run(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "endpoint_id": row["endpoint_id"],
        "suite_id": row["suite_id"],
        "model_id": row["model_id"],
        "model_name": row["model_name"],
        "is_thinking": bool(row["is_thinking"]),
        "status": row["status"],
        "avg_score": row["avg_score"],
        "avg_tps": row["avg_tps"],
        "total_time_s": row["total_time_s"],
        "started_at": row["started_at"],
        "completed_at": row["completed_at"],
        "results": [],
    }


@router.post("/api/benchmarks/run")
async def start_benchmark(body: BenchmarkRunRequest, db: aiosqlite.Connection = Depends(get_db)):
    log.warning(f"POST /api/benchmarks/run endpoint_id={body.endpoint_id} suite_id={body.suite_id} model_id={body.model_id}")
    # Validate endpoint
    ep = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (body.endpoint_id,))).fetchone()
    if not ep:
        raise HTTPException(404, "Endpoint not found")

    # Validate suite and get cases
    suite = await (await db.execute("SELECT * FROM test_suites WHERE id = ?", (body.suite_id,))).fetchone()
    if not suite:
        raise HTTPException(404, "Test suite not found")

    cases_cursor = await db.execute(
        "SELECT * FROM test_cases WHERE suite_id = ? ORDER BY sort_order", (body.suite_id,)
    )
    cases_rows = await cases_cursor.fetchall()
    if not cases_rows:
        raise HTTPException(400, "Test suite has no test cases")

    # Create run record
    now = datetime.utcnow().isoformat()
    cursor = await db.execute(
        """INSERT INTO benchmark_runs (endpoint_id, suite_id, model_id, model_name, is_thinking, status, started_at)
           VALUES (?, ?, ?, ?, ?, 'running', ?)""",
        (body.endpoint_id, body.suite_id, body.model_id, body.model_name, int(body.is_thinking), now),
    )
    await db.commit()
    run_id = cursor.lastrowid
    log.warning(f"Created run {run_id}, returning to frontend")

    return {"run_id": run_id, "status": "running"}


@router.get("/api/benchmarks/stream/{run_id}")
async def stream_benchmark(run_id: int, db: aiosqlite.Connection = Depends(get_db)):
    log.warning(f"GET /api/benchmarks/stream/{run_id} — SSE endpoint hit")
    run_row = await (await db.execute("SELECT * FROM benchmark_runs WHERE id = ?", (run_id,))).fetchone()
    if not run_row:
        log.warning(f"Run {run_id} not found in DB!")
        raise HTTPException(404, "Run not found")

    ep = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (run_row["endpoint_id"],))).fetchone()
    log.warning(f"Endpoint: {ep['name']} ({ep['base_url']})")
    cases_cursor = await db.execute(
        "SELECT * FROM test_cases WHERE suite_id = ? ORDER BY sort_order", (run_row["suite_id"],)
    )
    cases_rows = await cases_cursor.fetchall()
    log.warning(f"Loaded {len(cases_rows)} test cases for suite {run_row['suite_id']}")

    test_cases = []
    for r in cases_rows:
        test_cases.append({
            "id": r["id"],
            "test_id": r["test_id"],
            "category": r["category"],
            "name": r["name"],
            "system_prompt": r["system_prompt"],
            "user_prompt": r["user_prompt"],
            "eval_keywords": json.loads(r["eval_keywords"]),
            "eval_anti": json.loads(r["eval_anti"]),
            "eval_json": bool(r["eval_json"]),
            "eval_sentence_count": r["eval_sentence_count"],
            "max_tokens": r["max_tokens"],
            "media_type": r["media_type"] if "media_type" in r.keys() else None,
            "media_path": r["media_path"] if "media_path" in r.keys() else None,
        })

    client = OpenAI(base_url=ep["base_url"], api_key=ep["api_key"], timeout=120.0)
    _active_runs[run_id] = {"cancelled": False}
    log.warning(f"OpenAI client created for {ep['base_url']}, model={run_row['model_id']}")

    async def event_generator():
        log.warning(f"SSE generator started for run {run_id}")
        from config import DB_PATH
        db_write = None
        try:
            db_write = await aiosqlite.connect(str(DB_PATH))
            log.warning(f"DB write connection opened ({DB_PATH})")
        except Exception as e:
            log.error(f"FATAL: Failed to open DB write connection: {e}")
            yield ServerSentEvent(data=json.dumps({"run_id": run_id, "error": f"DB connection failed: {e}"}), event="error")
            return

        try:
            log.warning(f"Starting run_benchmark_stream for model={run_row['model_id']}, {len(test_cases)} tests")
            async for event in run_benchmark_stream(
                client, run_row["model_id"], bool(run_row["is_thinking"]), test_cases
            ):
                if _active_runs.get(run_id, {}).get("cancelled"):
                    yield ServerSentEvent(data=json.dumps({"run_id": run_id}), event="cancelled")
                    await db_write.execute(
                        "UPDATE benchmark_runs SET status = 'cancelled', completed_at = ? WHERE id = ?",
                        (datetime.utcnow().isoformat(), run_id)
                    )
                    await db_write.commit()
                    break

                evt = event["event"]
                data = event["data"]
                log.warning(f"Event: {evt}" + (f" — test: {data.get('name', '')}" if evt in ('test_start', 'test_done') else ""))

                if evt == "test_done":
                    await db_write.execute(
                        """INSERT INTO test_results (run_id, test_case_id, test_id, category, name,
                           content, elapsed_s, prompt_tokens, completion_tokens, tokens_per_sec,
                           finish_reason, final_score, keyword_score, keyword_hits, keyword_misses,
                           violations, had_thinking, thinking_tokens_approx, answer_length)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            run_id, data["test_case_id"], data["test_id"], data["category"], data["name"],
                            data["content"], data["elapsed_s"], data["prompt_tokens"],
                            data["completion_tokens"], data["tokens_per_sec"],
                            data["finish_reason"], data["final_score"], data["keyword_score"],
                            json.dumps(data["keyword_hits"]), json.dumps(data["keyword_misses"]),
                            json.dumps(data["violations"]), int(data["had_thinking"]),
                            data["thinking_tokens_approx"], data["answer_length"],
                        ),
                    )
                    await db_write.commit()

                if evt == "summary":
                    await db_write.execute(
                        """UPDATE benchmark_runs SET status = 'completed', avg_score = ?, avg_tps = ?,
                           total_time_s = ?, completed_at = ? WHERE id = ?""",
                        (data["avg_score"], data["avg_tps"], data["total_time_s"],
                         datetime.utcnow().isoformat(), run_id),
                    )
                    await db_write.commit()

                data["run_id"] = run_id
                yield ServerSentEvent(data=json.dumps(data), event=evt)

        except Exception as e:
            log.error(f"SSE stream error for run {run_id}: {e}", exc_info=True)
            try:
                await db_write.execute(
                    "UPDATE benchmark_runs SET status = 'failed', completed_at = ? WHERE id = ?",
                    (datetime.utcnow().isoformat(), run_id),
                )
                await db_write.commit()
            except Exception:
                pass
            yield ServerSentEvent(data=json.dumps({"run_id": run_id, "error": str(e)}), event="error")
        finally:
            _active_runs.pop(run_id, None)
            # If run is still "running" (e.g. client disconnected), mark as failed
            try:
                row = await (await db_write.execute(
                    "SELECT status FROM benchmark_runs WHERE id = ?", (run_id,)
                )).fetchone()
                if row and row["status"] == "running":
                    log.warning(f"Run {run_id} still 'running' at cleanup — marking failed")
                    await db_write.execute(
                        "UPDATE benchmark_runs SET status = 'failed', completed_at = ? WHERE id = ?",
                        (datetime.utcnow().isoformat(), run_id),
                    )
                    await db_write.commit()
            except Exception:
                pass
            await db_write.close()
            log.warning(f"SSE stream ended for run {run_id}")

    return EventSourceResponse(event_generator())


@router.post("/api/benchmarks/cancel/{run_id}")
async def cancel_benchmark(run_id: int):
    if run_id in _active_runs:
        _active_runs[run_id]["cancelled"] = True
        return {"message": "Cancellation requested"}
    raise HTTPException(404, "No active run with that ID")


@router.get("/api/benchmarks/runs", response_model=list[BenchmarkRunOut])
async def list_runs(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT * FROM benchmark_runs ORDER BY started_at DESC")
    runs = [_row_to_run(r) for r in await cursor.fetchall()]
    return runs


@router.get("/api/benchmarks/runs/{run_id}", response_model=BenchmarkRunOut)
async def get_run(run_id: int, db: aiosqlite.Connection = Depends(get_db)):
    row = await (await db.execute("SELECT * FROM benchmark_runs WHERE id = ?", (run_id,))).fetchone()
    if not row:
        raise HTTPException(404, "Run not found")
    run = _row_to_run(row)
    results_cursor = await db.execute("SELECT * FROM test_results WHERE run_id = ?", (run_id,))
    run["results"] = [_row_to_result(r) for r in await results_cursor.fetchall()]
    return run


@router.delete("/api/benchmarks/runs/{run_id}", status_code=204)
async def delete_run(run_id: int, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute("SELECT * FROM benchmark_runs WHERE id = ?", (run_id,))).fetchone()
    if not existing:
        raise HTTPException(404, "Run not found")
    await db.execute("DELETE FROM test_results WHERE run_id = ?", (run_id,))
    await db.execute("DELETE FROM benchmark_runs WHERE id = ?", (run_id,))
    await db.commit()


@router.get("/api/compare")
async def compare_runs(run_ids: str = Query(...), db: aiosqlite.Connection = Depends(get_db)):
    ids = [int(x.strip()) for x in run_ids.split(",") if x.strip()]
    runs = []
    for rid in ids:
        row = await (await db.execute("SELECT * FROM benchmark_runs WHERE id = ?", (rid,))).fetchone()
        if not row:
            raise HTTPException(404, f"Run {rid} not found")
        run = _row_to_run(row)
        results_cursor = await db.execute("SELECT * FROM test_results WHERE run_id = ?", (rid,))
        run["results"] = [_row_to_result(r) for r in await results_cursor.fetchall()]
        runs.append(run)
    return {"runs": runs}


@router.get("/api/export/runs/{run_id}")
async def export_run(run_id: int, format: str = Query("json"), db: aiosqlite.Connection = Depends(get_db)):
    row = await (await db.execute("SELECT * FROM benchmark_runs WHERE id = ?", (run_id,))).fetchone()
    if not row:
        raise HTTPException(404, "Run not found")
    run = _row_to_run(row)
    results_cursor = await db.execute("SELECT * FROM test_results WHERE run_id = ?", (run_id,))
    run["results"] = [_row_to_result(r) for r in await results_cursor.fetchall()]

    if format == "json":
        return Response(
            content=json.dumps(run, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="run_{run_id}.json"'},
        )
    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["test_id", "category", "name", "final_score", "tokens_per_sec", "elapsed_s",
                         "keyword_score", "had_thinking", "finish_reason"])
        for r in run["results"]:
            writer.writerow([r["test_id"], r["category"], r["name"], r["final_score"],
                             r["tokens_per_sec"], r["elapsed_s"], r["keyword_score"],
                             r["had_thinking"], r["finish_reason"]])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="run_{run_id}.csv"'},
        )
    elif format == "md":
        lines = [
            f"# Benchmark Run #{run_id}",
            f"**Model:** {run['model_name']} (`{run['model_id']}`)",
            f"**Score:** {run['avg_score']} | **Speed:** {run['avg_tps']} t/s | **Time:** {run['total_time_s']}s",
            f"**Status:** {run['status']} | **Date:** {run['started_at']}",
            "",
            "| Test | Category | Score | t/s | Time |",
            "|------|----------|-------|-----|------|",
        ]
        for r in run["results"]:
            lines.append(f"| {r['name']} | {r['category']} | {r['final_score']} | {r['tokens_per_sec']} | {r['elapsed_s']}s |")
        return Response(
            content="\n".join(lines),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="run_{run_id}.md"'},
        )
    else:
        raise HTTPException(400, f"Unsupported format: {format}")


@router.post("/api/benchmarks/import")
async def import_legacy(body: dict, db: aiosqlite.Connection = Depends(get_db)):
    """Import a legacy benchmark JSON file (from run_benchmark.py output)."""
    file_path = body.get("file_path")
    if not file_path:
        raise HTTPException(400, "file_path required")

    import os
    if not os.path.exists(file_path):
        raise HTTPException(404, f"File not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Ensure default suite exists
    suite = await (await db.execute("SELECT id FROM test_suites WHERE is_default = 1")).fetchone()
    if not suite:
        raise HTTPException(400, "Seed default tests first (POST /api/suites/seed-defaults)")
    suite_id = suite["id"]

    # Ensure a default endpoint exists
    ep = await (await db.execute("SELECT id FROM endpoints LIMIT 1")).fetchone()
    if not ep:
        raise HTTPException(400, "Create an endpoint first")
    endpoint_id = ep["id"]

    imported_runs = []
    for model_name, results in data.get("results", {}).items():
        model_id = data.get("models", {}).get(model_name, model_name)
        now = datetime.utcnow().isoformat()

        scores = [r.get("final_score", 0) for r in results]
        tps_vals = [r.get("tokens_per_sec", 0) for r in results]
        times = [r.get("elapsed_s", 0) for r in results]

        avg_score = round(sum(scores) / len(scores), 2) if scores else 0
        avg_tps = round(sum(tps_vals) / len(tps_vals), 1) if tps_vals else 0
        total_time = round(sum(times), 2)

        cursor = await db.execute(
            """INSERT INTO benchmark_runs (endpoint_id, suite_id, model_id, model_name, is_thinking,
               status, avg_score, avg_tps, total_time_s, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)""",
            (endpoint_id, suite_id, model_id, model_name, 0, avg_score, avg_tps, total_time, now, now),
        )
        run_id = cursor.lastrowid

        # Match test_case IDs from the default suite
        for r in results:
            tc = await (await db.execute(
                "SELECT id FROM test_cases WHERE suite_id = ? AND test_id = ?",
                (suite_id, r.get("test_id", "")),
            )).fetchone()
            tc_id = tc["id"] if tc else 0

            await db.execute(
                """INSERT INTO test_results (run_id, test_case_id, test_id, category, name,
                   content, elapsed_s, prompt_tokens, completion_tokens, tokens_per_sec,
                   finish_reason, final_score, keyword_score, keyword_hits, keyword_misses,
                   violations, had_thinking, thinking_tokens_approx, answer_length)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    run_id, tc_id, r.get("test_id", ""), r.get("category", ""),
                    r.get("name", ""), r.get("content", ""),
                    r.get("elapsed_s", 0), r.get("prompt_tokens", 0),
                    r.get("completion_tokens", 0), r.get("tokens_per_sec", 0),
                    r.get("finish_reason"), r.get("final_score", 0),
                    r.get("keyword_score", 0), json.dumps(r.get("keyword_hits", [])),
                    json.dumps(r.get("keyword_misses", [])), json.dumps(r.get("violations", [])),
                    int(r.get("had_thinking", False)), r.get("thinking_tokens_approx", 0),
                    r.get("answer_length", 0),
                ),
            )

        imported_runs.append({"run_id": run_id, "model": model_name, "tests": len(results)})

    await db.commit()
    return {"imported": imported_runs}
