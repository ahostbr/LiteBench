import time
import asyncio
import base64
import json as json_mod
import logging
import os
import urllib.request
from typing import AsyncGenerator
from openai import OpenAI
from engine.scorer import score_response

log = logging.getLogger("litebench")

# Models known to emit <think>...</think> blocks — get 5x token budget
THINKING_MODELS: set[str] = {"qwen/qwen3.5-35b-a3b"}

# Media type → OpenAI API content part type
_MEDIA_MAP = {
    "audio": "input_audio",
    "image": "image_url",
}


def _build_user_content(prompt: str, media_type: str | None, media_path: str | None) -> str | list:
    """Build user message content — plain text or multimodal parts."""
    if not media_type or not media_path or not os.path.exists(media_path):
        return prompt

    with open(media_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    ext = os.path.splitext(media_path)[1].lower().lstrip(".")
    parts = []

    if media_type == "audio":
        fmt = {"mp3": "mp3", "wav": "wav", "flac": "flac", "ogg": "ogg"}.get(ext, "wav")
        parts.append({"type": "input_audio", "input_audio": {"data": b64, "format": fmt}})
    elif media_type == "image":
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
        parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

    parts.append({"type": "text", "text": prompt})
    return parts


def _call_raw_http(base_url: str, model_id: str, messages: list, max_tokens: int, temperature: float) -> dict:
    """Direct HTTP call for multimodal — bypasses OpenAI client version issues."""
    url = base_url.rstrip("/") + "/chat/completions"
    # Give 5x token budget for thinking models (Gemma4 always thinks)
    # The actual answer is extracted from content, thinking is discarded by scorer
    body = json_mod.dumps({
        "model": model_id,
        "messages": messages,
        "max_tokens": max_tokens * 5,
        "temperature": temperature,
    }).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=120)
    return json_mod.loads(resp.read().decode())


def call_model(client: OpenAI, model_id: str, system: str, prompt: str, max_tokens: int,
               is_thinking: bool = False, media_type: str | None = None,
               media_path: str | None = None) -> dict:
    """Call a model and return response + metrics."""
    effective_max = 32768 if is_thinking else max_tokens

    user_content = _build_user_content(prompt, media_type, media_path)
    use_raw = media_type is not None and media_path is not None and os.path.exists(media_path)

    t0 = time.perf_counter()
    try:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
        log.warning(f"Calling model {model_id} (max_tokens={effective_max}, media={media_type or 'none'}, raw={use_raw}, base_url={client.base_url})")

        if use_raw:
            raw = _call_raw_http(str(client.base_url), model_id, messages, effective_max, 0.3)
            msg = raw["choices"][0]["message"]
            content = msg.get("content", "") or ""
            reasoning = msg.get("reasoning_content", "") or ""
            if reasoning and not content:
                content = f"<think>{reasoning}</think>"
            elif reasoning and content:
                content = f"<think>{reasoning}</think>\n{content}"
            usage_d = raw.get("usage", {})
            elapsed = time.perf_counter() - t0
            return {
                "content": content,
                "elapsed_s": round(elapsed, 2),
                "prompt_tokens": usage_d.get("prompt_tokens", 0),
                "completion_tokens": usage_d.get("completion_tokens", 0),
                "tokens_per_sec": round((usage_d.get("completion_tokens", 0) / elapsed), 1) if elapsed > 0 else 0,
                "finish_reason": raw["choices"][0].get("finish_reason"),
                "error": None,
            }

        kwargs = dict(
            model=model_id,
            messages=messages,
            max_tokens=effective_max,
            temperature=0.3,
        )
        resp = client.chat.completions.create(**kwargs)
        elapsed = time.perf_counter() - t0
        log.warning(f"Model responded in {elapsed:.1f}s, tokens={resp.usage.completion_tokens if resp.usage else '?'}")
        msg = resp.choices[0].message
        content = msg.content or ""
        reasoning = getattr(msg, "reasoning_content", None) or ""
        if reasoning and not content:
            content = f"<think>{reasoning}</think>"
        elif reasoning and content:
            content = f"<think>{reasoning}</think>\n{content}"
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
            tc["system_prompt"], tc["user_prompt"], tc["max_tokens"], is_thinking,
            tc.get("media_type"), tc.get("media_path"),
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
