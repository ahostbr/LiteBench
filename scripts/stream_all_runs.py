"""
Consumes SSE streams for all benchmark runs, triggering actual test execution.
Qwen runs stream 2 at a time (LM Studio constraint), Claude runs all parallel.
"""
import json
import sys
import threading
import time
import urllib.request

BASE = "http://localhost:8001"

SUITE_NAMES = {1:"Default",2:"Standard",3:"Stress",4:"Speed",5:"Judgment",6:"Multimodal",7:"Creator",8:"Agent"}

QWEN_RUNS   = {1:106, 2:107, 3:108, 4:105, 5:109, 6:110, 7:111, 8:112}
CLAUDE_RUNS = {1:113, 2:114, 3:115, 4:116, 5:117, 6:118, 7:119, 8:120}

results = {}  # run_id -> {"score": float, "status": str, "suite": str, "model": str}
lock = threading.Lock()


def stream_run(run_id: int, suite_name: str, model_label: str):
    """Consume SSE stream for a single run until completion."""
    url = f"{BASE}/api/benchmarks/stream/{run_id}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
        with urllib.request.urlopen(req, timeout=600) as resp:
            buf = ""
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buf += chunk.decode("utf-8", errors="replace")
                # Parse SSE events
                while "\n\n" in buf:
                    event_block, buf = buf.split("\n\n", 1)
                    for line in event_block.splitlines():
                        if line.startswith("data: "):
                            raw = line[6:].strip()
                            if raw in ("[DONE]", ""):
                                continue
                            try:
                                ev = json.loads(raw)
                                etype = ev.get("type")
                                if etype == "complete":
                                    score = ev.get("avg_score", 0)
                                    with lock:
                                        results[run_id] = {
                                            "score": score,
                                            "status": "completed",
                                            "suite": suite_name,
                                            "model": model_label,
                                        }
                                    print(f"✅ {model_label} {suite_name}: {score:.1f}%", flush=True)
                                    return
                                elif etype == "error":
                                    with lock:
                                        results[run_id] = {"status": "error", "suite": suite_name, "model": model_label, "score": 0}
                                    print(f"❌ {model_label} {suite_name}: ERROR — {ev.get('message','?')}", flush=True)
                                    return
                                elif etype == "result":
                                    passed = ev.get("final_score", 0)
                                    name = ev.get("name", "?")
                                    print(f"   [{model_label}] {suite_name}/{name}: {passed:.0f}%", flush=True)
                            except json.JSONDecodeError:
                                pass
    except Exception as e:
        with lock:
            results[run_id] = {"status": "error", "suite": suite_name, "model": model_label, "score": 0, "error": str(e)}
        print(f"❌ {model_label} {suite_name}: EXCEPTION — {e}", flush=True)


def run_with_semaphore(sem, run_id, suite_name, model_label):
    with sem:
        stream_run(run_id, suite_name, model_label)


# Claude: all 8 parallel (subprocess-based, no GPU constraint)
claude_sem = threading.Semaphore(8)
claude_threads = []
for suite_id, run_id in CLAUDE_RUNS.items():
    t = threading.Thread(
        target=run_with_semaphore,
        args=(claude_sem, run_id, SUITE_NAMES[suite_id], "Claude"),
        daemon=True,
    )
    claude_threads.append(t)

# Qwen: 2 at a time (LM Studio can handle a small queue without deadlock)
qwen_sem = threading.Semaphore(2)
qwen_threads = []
for suite_id, run_id in QWEN_RUNS.items():
    t = threading.Thread(
        target=run_with_semaphore,
        args=(qwen_sem, run_id, SUITE_NAMES[suite_id], "Qwen"),
        daemon=True,
    )
    qwen_threads.append(t)

print(f"Starting 8 Claude streams (all parallel) + 8 Qwen streams (2 at a time)...")
start = time.time()

for t in claude_threads + qwen_threads:
    t.start()

for t in claude_threads + qwen_threads:
    t.join(timeout=600)

elapsed = int(time.time() - start)
print(f"\n{'='*60}")
print(f"RESULTS ({elapsed}s total)")
print(f"{'='*60}")
print(f"{'Suite':<15} {'Claude':>10} {'Qwen':>10}")
print(f"{'-'*37}")
for suite_id in sorted(SUITE_NAMES):
    sname = SUITE_NAMES[suite_id]
    crid = CLAUDE_RUNS[suite_id]
    qrid = QWEN_RUNS[suite_id]
    cr = results.get(crid, {})
    qr = results.get(qrid, {})
    cscore = f"{cr['score']:.1f}%" if cr.get("score") is not None else cr.get("status","—")
    qscore = f"{qr['score']:.1f}%" if qr.get("score") is not None else qr.get("status","—")
    print(f"{sname:<15} {cscore:>10} {qscore:>10}")

# Overall averages
claude_scores = [r["score"] for r in results.values() if r.get("model") == "Claude" and r.get("score") is not None]
qwen_scores   = [r["score"] for r in results.values() if r.get("model") == "Qwen"   and r.get("score") is not None]
if claude_scores:
    print(f"\n{'OVERALL AVERAGE':<15} {sum(claude_scores)/len(claude_scores):>9.1f}% {sum(qwen_scores)/len(qwen_scores):>9.1f}%")

# Save results to JSON
out = {"claude": results, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
with open("C:/Projects/LiteBench/ai/data/trainer/head2head_results.json", "w") as f:
    json.dump({str(k): v for k, v in results.items()}, f, indent=2)
print("\nResults saved to ai/data/trainer/head2head_results.json")
