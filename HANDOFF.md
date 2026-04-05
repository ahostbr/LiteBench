# LiteBench Agent Handoff — Phase 5: Agent TUI with Tool-Use Loop

## Context

LiteBench is a standalone Electron + Python LLM benchmark studio at `C:/Projects/LiteBench`. The goal is to make it public and DM Matt Wolfe (600K YouTube subs) who explicitly asked for "an everyday user benchmark for local models."

Phases 1-4 are complete:
- **MCP server** (`mcp-server/`) with 4 tools: bench, web_search, web_fetch, youtube — all tested
- **Creator Suite** — 15 real-world tests seeded in both Python backend and Electron app
- **Winner Card** — bold scoreboard with PNG export in ComparisonView.tsx
- **Repo prep** — README, LICENSE, cleaned hardcoded paths

## What You're Building: Phase 5

### The Problem
LiteBench currently sends text prompts and scores text responses. That's a synthetic benchmark. Matt Wolfe wants to test what models can ACTUALLY DO — use tools, research the web, process real content.

### The Solution
Add an **Agent Benchmark Mode** where the model gets access to MCP tools and must complete real end-to-end tasks. Port the tool-use streaming loop from Kuroryuu V2.

### Source Code to Port

**Kuroryuu V2** at `E:/SAS/CLONE/Kuroryuu-master/apps/kuroryuu_cli_v2/`:

| File | What it does | Port to |
|------|-------------|---------|
| `src/providers/types.ts` | ToolSchema, AgentEvent, Message types with tool_call support | `src/main/engine/types.ts` |
| `src/providers/cliproxy.ts` | OpenAI-compatible streaming with tool calls — the core loop: stream → detect tool_call → execute → feed result back → continue | `src/main/engine/agent-runner.ts` |
| `src/services/harness.ts` | SQLite session/tool tracking (better-sqlite3) | Adapt into existing `src/main/db.ts` |

Also check:
- `E:/SAS/CLONE/Kuroryuu-master/apps/kuroryuu_cli_v2/src/providers/__tests__/` — may have test patterns
- `E:/SAS/CLONE/Kuroryuu-master/apps/desktop/src/renderer/components/marketing/` — ResearchPage, ScraperPage show the UI for tool-use flows

### Architecture

```
Current (Score Mode):
  prompt → model.chat.completions.create() → response → score(keywords)

New (Agent Mode):  
  task + tools[] → model.streamCompletion(messages, tools) 
    → tool_call event → execute MCP tool → feed result back
    → model continues → ... loop until done
    → score(final_output)
```

The MCP tools (`web_search`, `web_fetch`, `youtube`) become `ToolSchema[]` that the model can call during agent tasks.

### Agent Task Examples (real-world tests)

Instead of "write a YouTube hook" (text-only), an agent task is:
```
Task: "Research what's trending in AI this week and write a 5-tweet thread."
Tools available: web_search, web_fetch
Expected: Model searches, reads articles, synthesizes, writes thread
Score: keyword hits in final output + quality of synthesis
```

```
Task: "Get the transcript of [YouTube URL], extract the 3 key takeaways."  
Tools available: youtube
Expected: Model fetches transcript, analyzes, extracts
Score: Accuracy of takeaways vs actual content
```

### Implementation Steps

1. **Port types** — `ToolSchema`, `AgentEvent`, `Message` with tool_call fields
2. **Port agent runner** — streaming tool-use loop from `cliproxy.ts`, adapted to use LiteBench's existing endpoint system
3. **Wire MCP tools as ToolSchemas** — web_search, web_fetch, youtube become callable tools
4. **Add agent test cases** — new category in Creator Suite or separate "Agent Suite"  
5. **Add agent runner to benchmark flow** — detect `media_type === 'agent'` or new flag, route to agent runner instead of simple call_model
6. **Track tool calls in results** — extend test_results table with tool_call_count, tools_used columns
7. **Optional: TUI** — lightweight terminal UI based on Kuroryuu V2's Ink-based CLI for running agent benchmarks headless

### Key Files in LiteBench

| File | Role |
|------|------|
| `src/main/engine/runner.ts` | Current benchmark runner (text-only) — add agent mode here |
| `src/main/engine/scorer.ts` | Scoring logic — works as-is for agent output |
| `src/main/db.ts` | SQLite schema — may need tool_call tracking columns |
| `src/main/ipc/benchmarks-handlers.ts` | IPC handlers — route agent runs |
| `mcp-server/tools/*.py` | The Python MCP tools — need TypeScript wrappers or direct HTTP calls |
| `backend/engine/runner.py` | Python runner — also needs agent mode for MCP-proxied runs |

### Don't Forget

- Every Lite app has a **browser panel** — LiteBench should too eventually (LiteEditor's browser can be ported)
- Kuroryuu's **marketing panels** (ResearchPage, ScraperPage, etc.) show the UI pattern for tool-use surfaces
- The `/train` skill concept applies: run model A through agent tasks → run model B → compare → crown winner
- LiteBench uses **pnpm** (not Bun)
- The Python backend runs on port **8001**, MCP server is stdio
- Gemma 4 thinking model needs `--reasoning-format none` or 5x token budget
