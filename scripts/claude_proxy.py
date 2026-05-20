"""
Thin OpenAI-compatible proxy for Claude Sonnet 4.6 via Claude Code CLI.
Listens on :1235, translates /v1/chat/completions → claude -p subprocess call.
Lets LiteBench benchmark Claude without an ANTHROPIC_API_KEY.
"""
import asyncio
import json
import time
import uuid
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI()


def messages_to_prompt(messages: list[dict]) -> tuple[str, str]:
    """Extract system prompt and user prompt from OpenAI messages array."""
    system = ""
    parts = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                c.get("text", "") for c in content if isinstance(c, dict)
            )
        if role == "system":
            system = content
        elif role == "user":
            parts.append(content)
        elif role == "assistant":
            parts.append(f"[Assistant]: {content}")
    return system, "\n\n".join(parts)


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    max_tokens = body.get("max_tokens", 2048)

    system_prompt, user_prompt = messages_to_prompt(messages)

    # Build claude CLI command
    cmd = ["claude", "-p", user_prompt, "--output-format", "text"]
    if system_prompt:
        cmd += ["--system-prompt", system_prompt]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd="C:/Projects/LiteBench",
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        content = stdout.decode().strip() or stderr.decode().strip() or "(empty response)"
    except asyncio.TimeoutError:
        content = "(timeout)"
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Return OpenAI-compatible response
    return JSONResponse({
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "claude-sonnet-4-6",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": len(user_prompt) // 4,
            "completion_tokens": len(content) // 4,
            "total_tokens": (len(user_prompt) + len(content)) // 4,
        },
    })


@app.get("/v1/models")
async def list_models():
    return JSONResponse({
        "data": [{"id": "claude-sonnet-4-6", "object": "model", "owned_by": "anthropic"}]
    })


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=1235, log_level="warning")
