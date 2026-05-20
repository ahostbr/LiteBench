---
name: bench-orchestrator
description: Orchestrate LiteBench model testing — scan LM Studio for models, run the agent harness against each, collect scores, swap models, and produce a leaderboard. Triggers on "test models", "run benchmark", "run harness", "test all models", "benchmark models", "start testing".
type: skill
---

# LiteBench Orchestrator

You are running inside LiteBench's built-in terminal. You can orchestrate the entire
model testing pipeline: scan for models, run the harness, analyze results, produce leaderboards.

## Architecture Overview

LiteBench is an Electron app with two layers:
- **Electron main process** — hosts the agent runner, browser tools, IPC handlers
- **FastAPI backend** (`backend/`, port 8001) — SQLite DB, benchmark runs, test suites
- **React frontend** (`frontend/`, port 5174 dev / bundled in production)

The app is already running when you execute tests. **Never launch a second instance.**
Use CDP (port 9222) to connect to the running app, or use the built-in IPC/API endpoints.

## What You Have Access To

1. **LM Studio API** at `http://localhost:1234/v1/` — list models, chat completions
2. **CDP debug port** at `http://localhost:9222` — Playwright can connect to the running app
3. **The Agent Chat** — types prompts, agent uses real browser tools in the Browser panel
4. **The Agent Benchmark runner** — runs test suites via `bench:run:start` IPC with `is_agent_run: true`
5. **Direct API eval** via `scripts/eval_browser_test.py` — fast simulated eval with mocked tool results
6. **Harness results** at `ai/data/trainer/harness_evolution.jsonl` — all historical scores

## Key Files

| File | Purpose |
|------|---------|
| `src/main/engine/agent-harness.ts` | System prompt builder — 3 variants: native, small model, XML |
| `src/main/engine/agent-runner.ts` | Streaming tool-use loop (MAX_TOOL_ITERATIONS=5, MAX_TOOL_CALLS_PER_TURN=3) |
| `src/main/engine/tool-registry.ts` | Tool schemas + executors (browser, search, sandbox, write_file) |
| `src/main/engine/agent-benchmark-runner.ts` | Runs test suites through streamAgentChat(), scores via scorer.ts |
| `src/main/engine/scorer.ts` | Keywords, anti-patterns, regex, JSON validation, sentence count, min-length |
| `.claude/agents/litebench-agent.md` | Agent config — tool docs, browser workflow, response style |
| `src/main/data/suite-catalog.json` | All test case definitions (defaults, standard, stress, speed, judgment, creator, agent) |
| `src/main/index.ts` | Electron entry point (CDP enabled via `--remote-debugging-port=9222`) |
| `src/main/browser-manager.ts` | Browser session management (navigateTo, readPage, screenshot, etc.) |
| `src/main/browser-dom-helper.ts` | Injected JS for DOM indexing, clicking, typing |
| `ai/data/trainer/harness_evolution.jsonl` | All historical results (append-only JSONL) |
| `e2e/train-harness.ts` | Legacy harness — launches NEW Electron instance (avoid when app is running) |
| `e2e/chatgpt-image-gen.ts` | CDP-based test — connects to RUNNING app, types into Agent Chat |
| `scripts/eval_browser_test.py` | Fast simulated eval — calls LM Studio directly with mocked tool results |
| `scripts/add_chatgpt_test.py` | Injects test cases directly into the running SQLite DB |

## Available Browser Tools (agent can use these)

| Tool | Purpose | Args |
|------|---------|------|
| `browser_go` | Navigate to URL AND read page content | `url` |
| `browser_elements` | List interactive elements with indices | *(none)* |
| `browser_click` | Click element by index | `index` |
| `browser_type` | Type text into element by index | `text`, `index` |
| `browser_read` | Re-read current page without navigating (verify after interaction) | *(none)* |
| `browser_screenshot` | Capture screenshot of current page | *(none)* |
| `web_search` | DuckDuckGo HTML search | `query`, `max_results` |
| `web_fetch` | Fetch URL text content (Python subprocess) | `action`, `url` |
| `sandbox` | Execute code in subprocess | `action`, `code`, `language` |
| `youtube` | Video transcripts/info | `action`, `url` |
| `write_file` | Write HTML/CSS/JS (Arena mode only) | `filename`, `content` |

## IPC Handlers (Electron main process)

**Agent:**
- `bench:agent:send` — Send message to agent (streams via `bench:agent:stream:{conversationId}`)
- `bench:agent:cancel` — Cancel agent conversation

**Browser:**
- `bench:browser:create/destroy/navigate/read-page/click/type/screenshot/scroll/execute-js`

**Benchmarks:**
- `bench:run:start` — Start benchmark run (dispatches to agent or standard runner via `is_agent_run`)
- `bench:run:cancel/get/delete`, `bench:runs:list/compare`

**Test Tools (dev):**
- `test:tool:execute` — Execute a registered tool by name
- `test:tool:schemas` — Get all tool schemas
- `test:harness:prompt` — Build system prompt for a model

**Suites:**
- `bench:suites:list/create/delete/seed-*` — Manage test suites
- `bench:suites:seed-agent` — Seeds the Agent Suite from suite-catalog.json

## Workflow Options

### Option A: Live App Test via CDP (recommended for browser interaction tests)

Connects Playwright to the running app. Types into Agent Chat. Agent uses real Browser panel.

```bash
npx tsx e2e/chatgpt-image-gen.ts --model "qwen/qwen3.6-27b" --prompt "a dragon"
```

The test:
1. Connects to LiteBench via CDP on port 9222
2. Clicks "Agent Chat" and "Browser" panel buttons to open them
3. Sets the model in the Zustand store (localStorage)
4. Types the prompt into the Agent Chat textarea (`placeholder*="Ask the agent"`)
5. Polls the Zustand store for agent completion (tool calls + final text)
6. Scores tool-calling accuracy against expected sequence

**Critical:** The Agent Chat textarea selector must be specific — `textarea[placeholder*="Ask the agent"]` — because xterm.js (Terminal panel) has a hidden textarea that `textarea:first` will grab instead.

### Option B: Fast Simulated Eval (for system prompt tuning)

Calls LM Studio API directly with mocked tool results. No browser, no app interaction. ~10s per run.

```bash
python scripts/eval_browser_test.py "qwen/qwen3.6-27b"
```

Good for rapid iteration on `agent-harness.ts` system prompts. Checks if the model calls the right tools in the right order with the right arguments. Does NOT verify actual browser behavior.

### Option C: Agent Benchmark via UI

Uses the built-in benchmark runner through the LiteBench UI:
1. Open "Agent Benchmark" panel
2. Select Agent Suite (suite_id=8)
3. Pick model and endpoint
4. Click Run

Runs all 12 agent test cases through `streamAgentChat()` with real tool execution.
Scores: 60% text quality + 40% tool-calling accuracy (blended via tool_hints).

### Option D: Legacy Harness (avoid when app is running)

```bash
npx tsx e2e/train-harness.ts --model "<model-id>"
```

**WARNING:** This launches a NEW Electron instance. Do NOT use when LiteBench is already running — it will conflict. Only use for headless CI or when the app is closed.

### Option E: Direct DB Injection (for adding test cases to running app)

```bash
python scripts/add_chatgpt_test.py
```

Inserts test cases directly into the running SQLite DB. No rebuild needed. The app picks up changes immediately via its existing DB queries.

## Scan Models

```bash
curl -s http://localhost:1234/v1/models | python -c "import sys,json; d=json.load(sys.stdin); [print(m['id']) for m in d.get('data',[]) if not any(x in m['id'] for x in ['embed','flux','ocr'])]"
```

## Analyze Results

```bash
cat ai/data/trainer/harness_evolution.jsonl | python -c "
import sys, json
for line in sys.stdin:
    d = json.loads(line.strip())
    if d.get('type') in ('ui-evaluation', 'ui-driven-evaluation', 'chatgpt-image-gen-live'):
        model = d.get('model','?')
        score = d.get('avgScore', 0)
        perfect = d.get('perfectCount', 0)
        total = d.get('totalTests', 0)
        print(f'{score:5.1f}%  {perfect}/{total} perfect  {model}')
"
```

## System Prompt Architecture

Three prompt builders in `agent-harness.ts`:

| Function | When Used | Token Budget |
|----------|-----------|-------------|
| `buildNativeSystemPrompt()` | Models with native OpenAI tool calling (Devstral, Qwen, Llama, Gemma 4, DeepSeek, Phi-4) | ~400 tokens |
| `buildSmallModelPrompt()` | Sub-2B models (detected via `isSmallModel()`) | ~200 tokens |
| `buildXMLSystemPrompt()` | Models without native tool calling (Gemma 3) | ~2000 tokens |

Key system prompt rules that affect scores:
- `MAX 5 tool calls per task` — bump this if tests need more steps
- `browser_elements MUST be called before browser_click/browser_type` — prevents index guessing
- `browser_read() to verify after interaction` — prevents blind fire-and-forget
- `NEVER say "I cannot access"` — anti-refusal instruction
- Tool argument examples with exact field names — prevents empty `{}` args

## Model Compatibility

| Pattern in model ID | Tool Calling Mode | Notes |
|---------------------|-------------------|-------|
| devstral, mistral, qwen, llama-3/4, gemma-4, deepseek, phi-4 | Native (OpenAI API) | Best performance |
| gemma-3 | XML fallback | Writes `<tool_call>` in text |
| Sub-2B models | Native + simplified prompt | Lower temperature, compact instructions |

## Training Loop (harness tuning)

To improve scores on a specific test case:

1. **Run eval** — `python scripts/eval_browser_test.py "model-id"` (fast, simulated)
2. **Analyze failures** — which tools weren't called? Wrong order? Missing args?
3. **Mutate** — edit `agent-harness.ts` system prompt (one change at a time)
4. **Rebuild** — `npx electron-vite build`
5. **Re-eval** — run again, compare scores
6. **Keep/revert** — if improved keep; if regressed revert via git

Common fixes:
- Model doesn't call tools → strengthen "you MUST use tools" language
- Model repeats tool calls → add "NEVER repeat a tool call"
- Empty response after tools → add "you MUST write a text response"
- Wrong tool args → add concrete examples with exact field names
- Max tool limit too low → bump the max (was 3, now 5)
- Stale tool names in prompts → verify against `tool-registry.ts`

## Important Notes

- **The app is already running** — never launch a second Electron instance
- **CDP port 9222** is enabled via `app.commandLine.appendSwitch` in `src/main/index.ts`
- **Agent Chat textarea** selector: `textarea[placeholder*="Ask the agent"]` (not `textarea:first`)
- Models must be LOADED in LM Studio before testing (check via `/v1/models`)
- Filter non-LLM models: flux (image), embed (embedding), ocr, glm-ocr
- Suite catalog changes need rebuild + re-seed (delete existing suite in UI, then seed again)
- DB injection (`scripts/add_chatgpt_test.py`) bypasses the rebuild requirement for test cases
- `browser-dom-helper.ts` uses `document.execCommand('insertText')` for contentEditable inputs (ProseMirror/ChatGPT compatibility)
