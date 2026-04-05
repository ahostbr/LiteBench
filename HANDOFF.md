# LiteBench Agent Handoff — Harness Training + Polish

## Context

LiteBench is a standalone Electron + React LLM benchmark studio at `C:/Projects/LiteBench`. Phase 5 is complete — agent chat, browser panel, 11 tools, agent benchmarks. The goal is to demo this to Matt Wolfe (600K YouTube subs) who asked for "an everyday user benchmark for local models."

Everything works end-to-end: Devstral navigates Hacker News in the embedded browser, reads page content, calls web search, executes code in sandbox. Verified via Playwright E2E tests.

## What You're Picking Up

### 1. Harness Training — Improve Tool Reliability

The agent harness (`src/main/engine/agent-harness.ts`) generates model-specific system prompts. Current NinjaJSON discipline: "ONE tool per step, STOP and wait."

**Baseline scores** (from `ai/data/trainer/harness_evolution.jsonl`):
- Devstral Small 2 (24B): 100% — all tools fire, responses include data
- Qwen 3 4B: 67% — browser + search work, sandbox fails
- Gemma 4 31B: untested with latest cap (was generating 600+ tool calls, now capped at 3)

**What to tune**:
- Run `npx tsx e2e/train-harness.ts` to evaluate
- Mutate `buildNativeSystemPrompt()` in `agent-harness.ts`
- Re-evaluate, keep/revert based on score
- Use `/train --target litebench-agent` for the autonomous loop

### 2. Fix Gemma 3 4B (XML Fallback)

Gemma 3 4B writes `<tool_call>` XML as text instead of using the native API. It's currently listed in `NATIVE_TOOL_MODEL_PATTERNS` as `gemma-4` — but `gemma-3` doesn't support native tool calling. Fix: remove `gemma-3` pattern or add a specific exclusion. The XML fallback (`buildXMLSystemPrompt`) + `parseXMLToolCalls` already exist but aren't being triggered for Gemma 3.

### 3. Recommended Models Feature

Add a curated list of recommended models to the UI. Models that work well with LiteBench's agent tools:
- **Devstral Small 2** (24B) — best agent performance, 100% tool reliability
- **Qwen 3 4B** (4B) — decent for basic tasks on limited hardware
- **Llama 3.1 8B** (8B) — good balance (not yet tested)
- **Devstral 3B** (3B) — smallest Mistral with tool support (not yet tested)

Show in Settings panel or as a banner. Include LM Studio search links.

### 4. Make Repo Public + DM Matt Wolfe

GitHub repo: `ahostbr/LiteBench` (currently private)
- `gh repo edit ahostbr/LiteBench --visibility public`
- DM Matt Wolfe on Twitter/X with link + demo video

## Key Architecture

```
Renderer (React)                     Main Process (Node)
┌──────────────────────┐            ┌──────────────────────────┐
│  AgentPanel           │──IPC────→ │ agent-handlers.ts        │
│  BrowserPanel         │           │   ↓                      │
│  AgentBenchmarkPanel  │           │ agent-runner.ts           │
│                       │←─events── │   ↓ OpenAI streaming     │
│  Stores (Zustand)     │           │ agent-harness.ts (prompt) │
│  - agent-chat-store   │           │   ↓ tool_call detected   │
│  - agent-benchmark    │           │ tool-registry.ts          │
│  - workspace-store    │           │   ↓ dispatch              │
└──────────────────────┘           │ tool-executor.ts (Python) │
                                    │ browser-manager.ts (IPC)  │
                                    └──────────────────────────┘
```

### IPC Channel Pattern
- Agent chat: `bench:agent:send` → returns `{ conversationId }` → events on `bench:agent:stream:{conversationId}`
- The `conversationId` is a `crypto.randomUUID()` from the main process, NOT the Zustand conversation ID
- AgentPanel subscribes AFTER send, using the server-returned ID

### Tool Execution Paths
- **Python tools** (web_search, web_fetch, youtube, sandbox, pccontrol): `tool-executor.ts` → `python -c "..." < stdin`
- **Browser tools** (navigate, read_page, click, type, screenshot): direct calls to `browser-manager.ts` functions
- **Single browser session**: agent uses the visible Browser panel's session, no invisible sessions

### NinjaJSON System Prompt Pattern
- `supportsNativeToolCalling(modelId)` — checks against `NATIVE_TOOL_MODEL_PATTERNS`
- Native models: minimal prompt (~200 tokens) + tools via API
- XML models: verbose prompt (~2000 tokens) with `<tool_call>` format embedded
- Tool discipline: "ONE tool per step, STOP, read result, decide next"
- `MAX_TOOL_CALLS_PER_TURN = 3` — hard cap per model turn
- `MAX_TOOL_ITERATIONS = 5` — max loop iterations

## Critical Files

| File | Role |
|------|------|
| `src/main/engine/agent-harness.ts` | System prompt builder (THE FILE TO TUNE) |
| `src/main/engine/agent-runner.ts` | Streaming tool-use loop |
| `src/main/engine/tool-registry.ts` | Tool registration + dispatch |
| `src/main/engine/tool-executor.ts` | Python subprocess executor (stdin) |
| `src/main/browser-manager.ts` | WebContentsView session management |
| `src/main/ipc/agent-handlers.ts` | Agent chat IPC handlers |
| `src/renderer/components/agent/AgentPanel.tsx` | Chat UI |
| `src/renderer/components/browser/BrowserPanel.tsx` | Browser UI |
| `src/renderer/stores/agent-chat-store.ts` | Chat state (Zustand + persist) |
| `mcp-server/tools/*.py` | Python tool implementations |
| `.claude/agents/litebench-agent.md` | Agent config for /train |
| `e2e/train-harness.ts` | Training evaluation script |
| `e2e/multi-model-baseline.ts` | Multi-model comparison |

## Don't Forget

- Use **pnpm** (not Bun)
- Use `python` not `python3` (Windows)
- DuckDuckGo search uses `ddgs` package (renamed from `duckduckgo-search`)
- `browser_navigate` uses the VISIBLE browser panel session — no invisible sessions
- Gemma 4 31B generates 600+ tool calls without the cap — ALWAYS keep MAX_TOOL_CALLS_PER_TURN
- The polymathic review (Einstein/Newton/Da Vinci/Socrates) findings are in memory — key fix was IPC channel mismatch
- LiteBench was absorbed into LiteSuite — this standalone is the Matt Wolfe demo vehicle
