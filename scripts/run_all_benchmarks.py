"""
Benchmark all local LM Studio models across all test suites.
Loads one model at a time, runs all suites, then swaps to the next.
"""

import subprocess
import time
import json
import sys
import os
import requests
import sseclient

# Force UTF-8 unbuffered output (Windows cp1252 can't handle model unicode output)
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import sqlite3

LMS_CLI = f"{os.environ['USERPROFILE']}\\.lmstudio\\bin\\lms.exe"
LITEBENCH_URL = "http://localhost:8001"
LMSTUDIO_URL = "http://localhost:1234"
ENDPOINT_ID = 1  # LM Studio endpoint in DB
DB_PATH = "C:/Projects/LiteBench/backend/litebench.db"

# All suites to run
SUITE_IDS = [1, 2, 3, 4, 5, 7, 8]  # Skip 6 (Multimodal) for text-only models
MULTIMODAL_SUITE = 6

# Models to benchmark (exclude flux image generators and embeddings)
SKIP_MODELS = {"flux.1-dev", "flux.2-dev", "text-embedding-mxbai-embed-large-v1", "text-embedding-nomic-embed-text-v1.5"}

# VLM models that can handle multimodal suite
VLM_MODELS = set()  # Will be populated from API


def get_all_models():
    """Get model list from LM Studio API."""
    resp = requests.get(f"{LMSTUDIO_URL}/api/v0/models")
    data = resp.json()
    models = []
    for m in data.get("data", data if isinstance(data, list) else []):
        model_id = m.get("id", "")
        model_type = m.get("type", "")
        if model_id in SKIP_MODELS or model_type == "embedding":
            continue
        if "flux" in model_id.lower():
            continue
        models.append({"id": model_id, "type": model_type})
        if model_type == "vlm":
            VLM_MODELS.add(model_id)
    return models


def get_completed_runs() -> set:
    """Get set of (model_id, suite_id) pairs that already completed successfully."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT model_id, suite_id FROM benchmark_runs WHERE status = 'completed'"
    ).fetchall()
    conn.close()
    return {(r["model_id"], r["suite_id"]) for r in rows}


def run_lms(*args, timeout=60):
    """Run lms CLI with proper encoding."""
    env = __import__('os').environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        [LMS_CLI] + list(args),
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=timeout, env=env
    )


def load_model(model_id: str) -> bool:
    """Load a model via lms CLI. Returns True if successful."""
    print(f"\n{'='*60}")
    print(f"LOADING: {model_id}")
    print(f"{'='*60}")

    # Unload any currently loaded model first
    run_lms("unload", "--all", timeout=30)
    time.sleep(2)

    # Load the target model
    result = run_lms("load", model_id, "-y", timeout=120)
    if result.returncode != 0:
        print(f"  ERROR loading: {result.stderr}")
        return False

    # Wait for model to be ready
    time.sleep(3)

    # Verify it responds
    for attempt in range(5):
        try:
            resp = requests.post(
                f"{LMSTUDIO_URL}/v1/chat/completions",
                json={"model": model_id, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5},
                timeout=30
            )
            if resp.status_code == 200:
                print(f"  Model ready (attempt {attempt+1})")
                return True
        except Exception as e:
            print(f"  Waiting for model... (attempt {attempt+1}): {e}")
            time.sleep(5)

    print(f"  FAILED: Model not responding after 5 attempts")
    return False


def get_loaded_model_name() -> str:
    """Get the actual model name as LM Studio reports it."""
    try:
        resp = requests.get(f"{LMSTUDIO_URL}/v1/models", timeout=5)
        data = resp.json()
        for m in data.get("data", []):
            return m.get("id", "")
    except Exception:
        pass
    return ""


def run_suite(model_id: str, model_name: str, suite_id: int, is_thinking: bool = False) -> dict:
    """Run a single benchmark suite and wait for completion via SSE."""
    print(f"  Running suite {suite_id} on {model_name}...")

    # Start the run
    resp = requests.post(f"{LITEBENCH_URL}/api/benchmarks/run", json={
        "endpoint_id": ENDPOINT_ID,
        "suite_id": suite_id,
        "model_id": model_id,
        "model_name": model_name,
        "is_thinking": is_thinking,
        "mode": "baseline"
    })

    if resp.status_code != 200:
        print(f"    ERROR starting run: {resp.status_code} {resp.text}")
        return {"error": resp.text}

    run_data = resp.json()
    run_id = run_data["run_id"]
    print(f"    Run ID: {run_id}")

    # Stream SSE events until done
    try:
        stream_resp = requests.get(
            f"{LITEBENCH_URL}/api/benchmarks/stream/{run_id}",
            stream=True, timeout=600
        )
        stream_resp.encoding = "utf-8"
        client = sseclient.SSEClient(stream_resp)

        test_count = 0
        summary = None
        for event in client.events():
            if event.event == "test_done":
                test_count += 1
                data = json.loads(event.data)
                score = data.get("final_score", 0)
                tps = data.get("tokens_per_sec", 0)
                print(f"    [{test_count}] {data.get('name', '?')}: score={score}, tps={tps:.1f}")
            elif event.event == "summary":
                summary = json.loads(event.data)
                print(f"    DONE: avg_score={summary.get('avg_score')}, avg_tps={summary.get('avg_tps')}, time={summary.get('total_time_s')}s")
            elif event.event == "error":
                error_data = json.loads(event.data)
                print(f"    ERROR: {error_data.get('error', 'unknown')}")
                return {"error": error_data.get("error")}

        return summary or {"tests_completed": test_count}

    except Exception as e:
        print(f"    STREAM ERROR: {e}")
        return {"error": str(e)}


def main():
    print("=" * 60)
    print("LiteBench Full Model Benchmark Run")
    print("=" * 60)

    # Get models
    models = get_all_models()
    print(f"\nFound {len(models)} models to benchmark:")
    for m in models:
        print(f"  - {m['id']} ({m['type']})")

    print(f"\nSuites: {SUITE_IDS} + multimodal ({MULTIMODAL_SUITE}) for VLMs")
    print(f"VLM models: {VLM_MODELS}")

    # Check what's already done
    completed = get_completed_runs()
    print(f"\nAlready completed: {len(completed)} model+suite combinations")

    results = {}
    total_models = len(models)

    for i, model in enumerate(models, 1):
        model_id = model["id"]
        model_type = model["type"]

        print(f"\n\n{'#'*60}")
        print(f"# MODEL {i}/{total_models}: {model_id}")
        print(f"{'#'*60}")

        # Load the model
        if not load_model(model_id):
            print(f"  SKIPPING {model_id} — failed to load")
            results[model_id] = {"status": "load_failed"}
            continue

        # Get actual loaded model name (may differ from ID)
        actual_name = get_loaded_model_name() or model_id

        # Determine which suites to run
        suites_to_run = list(SUITE_IDS)
        if model_type == "vlm" or model_id in VLM_MODELS:
            suites_to_run.append(MULTIMODAL_SUITE)

        model_results = {}
        for suite_id in suites_to_run:
            if (model_id, suite_id) in completed:
                print(f"  Suite {suite_id} already completed for {model_id} — skipping")
                continue
            result = run_suite(actual_name, model_id, suite_id)
            model_results[f"suite_{suite_id}"] = result
            time.sleep(1)  # Brief pause between suites

        results[model_id] = model_results

        # Unload after all suites complete
        run_lms("unload", "--all", timeout=30)
        time.sleep(2)

    # Final report
    print("\n\n" + "=" * 60)
    print("BENCHMARK COMPLETE — SUMMARY")
    print("=" * 60)
    for model_id, model_res in results.items():
        if model_res.get("status") == "load_failed":
            print(f"  {model_id}: LOAD FAILED")
        else:
            scores = []
            for suite_key, suite_res in model_res.items():
                if isinstance(suite_res, dict) and "avg_score" in suite_res:
                    scores.append(suite_res["avg_score"])
            if scores:
                avg = sum(scores) / len(scores)
                print(f"  {model_id}: avg={avg:.1f}% across {len(scores)} suites")
            else:
                print(f"  {model_id}: no scores recorded")

    # Save results
    with open("C:/Projects/LiteBench/scripts/benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to scripts/benchmark_results.json")


if __name__ == "__main__":
    main()
