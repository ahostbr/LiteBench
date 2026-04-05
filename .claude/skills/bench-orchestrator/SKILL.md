---
name: bench-orchestrator
description: Orchestrate LiteBench model testing — scan LM Studio for models, run the agent harness against each, collect scores, swap models, and produce a leaderboard. Triggers on "test models", "run benchmark", "run harness", "test all models", "benchmark models", "start testing".
type: skill
---

# LiteBench Orchestrator

You are running inside LiteBench's built-in terminal. You can orchestrate the entire
model testing pipeline: scan for models, run the harness, analyze results, produce leaderboards.

## What You Have Access To

1. **LM Studio API** at `http://localhost:1234/v1/` — list models, chat completions
2. **The harness test** at `e2e/train-harness.ts` — runs 5 agent tool tests against any model
3. **Harness results** at `ai/data/trainer/harness_evolution.jsonl` — all historical scores
4. **The app itself** — Electron + React, builds with `npx electron-vite build`

## Workflow

### Step 1: Scan Models

```bash
curl -s http://localhost:1234/v1/models | python -c "import sys,json; d=json.load(sys.stdin); [print(m['id']) for m in d.get('data',[]) if not any(x in m['id'] for x in ['embed','flux','ocr'])]"
```

This lists all loaded LLM models (filters out embedding, image gen, and OCR models).

### Step 2: Run Harness

For each model:

```bash
npx tsx e2e/train-harness.ts --model "<model-id>"
```

This:
- Builds the app (`npx electron-vite build`)
- Launches Electron via Playwright
- Opens Browser + Agent Chat panels
- Runs 5 tests (browser navigate, web search, HN browsing, code sandbox, URL fetch)
- Scores each test (binary assertions)
- Logs results to `ai/data/trainer/harness_evolution.jsonl`
- Takes screenshots to `e2e/screenshots/`

### Step 3: Analyze Results

```bash
cat ai/data/trainer/harness_evolution.jsonl | python -c "
import sys, json
for line in sys.stdin:
    d = json.loads(line.strip())
    if d.get('type') in ('ui-evaluation', 'ui-driven-evaluation'):
        model = d.get('model','?')
        score = d.get('avgScore', 0)
        perfect = d.get('perfectCount', 0)
        total = d.get('totalTests', 0)
        print(f'{score:5.1f}%  {perfect}/{total} perfect  {model}')
"
```

### Step 4: Produce Leaderboard

After testing all models, produce a markdown leaderboard sorted by score.

## Key Files

| File | Purpose |
|------|---------|
| `e2e/train-harness.ts` | Harness evaluation script |
| `src/main/engine/agent-harness.ts` | System prompt builder (tune for model improvements) |
| `src/main/engine/agent-runner.ts` | Streaming tool-use loop |
| `src/main/engine/tool-registry.ts` | Tool schemas + executors |
| `ai/data/trainer/harness_evolution.jsonl` | All historical results |

## Important Notes

- Build ONCE before running multiple models (skip rebuild on subsequent runs if no code changed)
- Each test run takes 15-60 seconds depending on model size
- The harness opens an Electron window — don't interact with it while tests run
- Models must be LOADED in LM Studio before testing (check via /v1/models)
- Filter out non-LLM models: flux (image), embed (embedding), ocr, glm-ocr

## Model Compatibility

| Pattern in model ID | Tool Calling Mode | Notes |
|---------------------|-------------------|-------|
| devstral, mistral, qwen, llama-3/4, gemma-4, deepseek, phi-4 | Native (OpenAI API) | Best performance |
| gemma-3 | XML fallback | Writes `<tool_call>` in text |
| Sub-2B models | Native + simplified prompt | Lower temperature, compact instructions |
