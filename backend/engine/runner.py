import time
import asyncio
import logging
from typing import AsyncGenerator
from openai import OpenAI
from engine.scorer import score_response

log = logging.getLogger("litebench")

# Models known to emit <think>...</think> blocks — get 5x token budget
THINKING_MODELS: set[str] = {"qwen/qwen3.5-35b-a3b"}


def call_model(client: OpenAI, model_id: str, system: str, prompt: str, max_tokens: int,
               is_thinking: bool = False) -> dict:
    """Call a model and return response + metrics."""
    effective_max = max_tokens * 5 if is_thinking else max_tokens

    t0 = time.perf_counter()
    try:
        kwargs = dict(
            model=model_id,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens=effective_max,
            temperature=0.3,
        )
        log.warning(f"Calling model {model_id} (max_tokens={effective_max}, base_url={client.base_url})")
        resp = client.chat.completions.create(**kwargs)
        elapsed = time.perf_counter() - t0
        log.warning(f"Model responded in {elapsed:.1f}s, tokens={resp.usage.completion_tokens if resp.usage else '?'}")
        content = resp.choices[0].message.content or ""
        usage = resp.usage
        return {
            "content": content,
            "elapsed_s": round(elapsed, 2),
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "tokens_per_sec": round((usage.completion_tokens / elapsed), 1) if usage and elapsed > 0 else 0,
            "finish_reason": resp.choices[0].finish_reason,
            "error": None,
        }
    except Exception as e:
        log.error(f"Model call FAILED: {e}")
        elapsed = time.perf_counter() - t0
        return {
            "content": "",
            "elapsed_s": round(elapsed, 2),
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "tokens_per_sec": 0,
            "finish_reason": "error",
            "error": str(e),
        }


async def run_benchmark_stream(
    client: OpenAI,
    model_id: str,
    is_thinking: bool,
    test_cases: list[dict],
) -> AsyncGenerator[dict, None]:
    """Async generator that yields SSE events as each test completes."""
    total = len(test_cases)
    yield {"event": "started", "data": {"model": model_id, "total_tests": total}}

    scores = []
    tps_values = []
    total_time = 0.0

    for i, tc in enumerate(test_cases):
        yield {"event": "test_start", "data": {"test_index": i, "test_id": tc["test_id"], "name": tc["name"]}}

        # Run the sync OpenAI call in a thread to avoid blocking the event loop
        resp = await asyncio.to_thread(
            call_model, client, model_id,
            tc["system_prompt"], tc["user_prompt"], tc["max_tokens"], is_thinking
        )

        score_result = score_response({
            "eval_keywords": tc.get("eval_keywords", []),
            "eval_anti": tc.get("eval_anti", []),
            "eval_json": tc.get("eval_json", False),
            "eval_sentence_count": tc.get("eval_sentence_count"),
        }, resp["content"])

        scores.append(score_result["final_score"])
        tps_values.append(resp["tokens_per_sec"])
        total_time += resp["elapsed_s"]

        yield {
            "event": "test_done",
            "data": {
                "test_index": i,
                "test_id": tc["test_id"],
                "test_case_id": tc["id"],
                "name": tc["name"],
                "category": tc["category"],
                "content": resp["content"],
                "elapsed_s": resp["elapsed_s"],
                "prompt_tokens": resp["prompt_tokens"],
                "completion_tokens": resp["completion_tokens"],
                "tokens_per_sec": resp["tokens_per_sec"],
                "finish_reason": resp["finish_reason"],
                "error": resp["error"],
                **score_result,
            },
        }

    avg_score = round(sum(scores) / len(scores), 2) if scores else 0
    avg_tps = round(sum(tps_values) / len(tps_values), 1) if tps_values else 0

    yield {
        "event": "summary",
        "data": {
            "avg_score": avg_score,
            "avg_tps": avg_tps,
            "total_time_s": round(total_time, 2),
        },
    }

    yield {"event": "done", "data": {}}
