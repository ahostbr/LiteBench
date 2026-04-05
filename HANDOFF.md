# LiteBench Agent Handoff — Harness Trained, Models Baselined

## Context

LiteBench is a standalone Electron + React LLM benchmark studio at `C:/Projects/LiteBench`. The goal is to demo this to Matt Wolfe (600K YouTube subs) who asked for "an everyday user benchmark for local models."

Everything works end-to-end. Harness training is complete — 3 cycles of iterative improvements pushed 6 models to 100% tool reliability.

## What Was Done (Training Session 2026-04-04)

### Harness Training — 3 Cycles

**Cycle 1: Core fixes**
- `browser_navigate` now awaits `did-finish-load` event (was returning instantly)
- `browser_read_page` returns clean markdown text (was raw JSON with element bounds)
- NinjaJSON system prompt rewritten: one-tool-per-message, anti-repetition, browser workflow
- XML tool call parsing wired into `agent-runner.ts` (parseXMLToolCalls was never called)
- Result: Devstral 80%→100%, Qwen 3 4B 67%→100%, Gemma 3 4B 0%→80%

**Cycle 2: Parser broadening**
- XML parser handles `[TOOL_REQUEST]...[END_*]` and bare JSON formats
- Stronger "MUST write response" prompt language
- Result: Gemma 3 12B 50%→73%, Gemma 3 4B 80%→93%

**Cycle 3: Stream break fix**
- Gemma 4 31B generated 600+ tool calls, stream never finished → 90s timeout
- Fix: break stream immediately at `MAX_TOOL_CALLS_PER_TURN` cap instead of silently skipping
- Result: Gemma 4 31B 18%→100% (one-line fix!)

**Small model optimizations:**
- `isSmallModel()` detection for sub-2B models
- Compact system prompt with concrete tool-use example
- Lower temperature (0.3) for small models
- `tool-executor.ts`: `shell: true` for Python spawn (Windows ENOENT fix)

### Full Leaderboard

| Model | Params | Score | Notes |
|-------|--------|-------|-------|
| Devstral Small 2 | 24B | 100% | Best overall agent |
| Gemma 4 31B Opus Distill | 31B | 100% | Chain-of-thought reasoning |
| Gemma 4 E2B Opus Distill | ~11B | 100% | Plans before acting |
| Gemma 4 31B | 31B | 100% | Needed stream-break fix |
| Qwen 3 4B | 4B | 100% | Best small model |
| Gemma 4 26B-A4B | 26B | 93% | Flaky DuckDuckGo only miss |
| Gemma 3 4B | 4B | 93% | XML fallback path |
| Qwen 3.5 0.8B Opus Distill | 752M | 87% | Sub-1B ceiling |
| Gemma 3 12B Uncensored | 12B | 73% | Malformed XML variants |
| Qwen 3.5 9B Uncensored | 9B | 50% | Broken fine-tune |

### Key Findings

1. **Opus distills dominate** — superior behavior (planning, chain-of-thought, clean tool use)
2. **Qwen 3 4B is the everyday user sweet spot** — 100% at 4B, runs on anything
3. **Uncensored fine-tunes hurt tool calling** — abliteration strips instruction-following
4. **Stream breaking is critical** — must cut the stream, not silently skip excess tool calls
5. **0.8B ceiling at ~87%** — model capacity limit, not harness

## What's Next

### Models To Test
- **Gemma 4 E2B (base)** — Q8 copied to LM Studio from `~/.litesuite/llm/models/`
- **Gemma 4 E4B** — new size tier, never tested
- **Qwen 2.5 Omni 7B** — copied to LM Studio
- **xLAM series (1B/3B/8B)** — Salesforce, purpose-built for function calling, tops BFCL
- **Hermes 3 (3B/8B)** — NousResearch gold standard
- **Llama 3.1 8B / 3.2 3B** — Meta native tool calling

### Features To Build
1. **Recommended Models UI** — curated list with LM Studio download links
2. **Make repo public** — `gh repo edit ahostbr/LiteBench --visibility public`
3. **DM Matt Wolfe** with link + demo video

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

## Critical Files

| File | Role |
|------|------|
| `src/main/engine/agent-harness.ts` | System prompt builder — native, XML, small model variants |
| `src/main/engine/agent-runner.ts` | Streaming tool-use loop with stream-break cap |
| `src/main/engine/tool-registry.ts` | Tool registration + clean text output for browser |
| `src/main/engine/tool-executor.ts` | Python subprocess executor (stdin, shell:true) |
| `src/main/browser-manager.ts` | WebContentsView with did-finish-load await |
| `e2e/train-harness.ts` | Training evaluation script (UI-driven) |
| `ai/data/trainer/harness_evolution.jsonl` | All baseline data |

## Don't Forget

- Use **pnpm** (not Bun)
- Use `python` not `python3` (Windows)
- LiteSuite models live at `~/.litesuite/llm/models/` — separate from LM Studio `~/.lmstudio/models/`
- `browser_navigate` now returns `{url, title}` — awaits page load
- `MAX_TOOL_CALLS_PER_TURN = 3` — stream BREAKS at this cap, doesn't just skip
- Gemma 3 models use XML fallback, not native tool calling
- `isSmallModel()` detects sub-2B and gives compact prompt + low temperature
