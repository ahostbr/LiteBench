---
name: harness-tune
description: Tune the agent harness system prompts to improve model tool-calling scores. Triggers on "tune harness", "improve scores", "train harness", "optimize prompts".
type: skill
---

# Harness Tuner

Iteratively improve `src/main/engine/agent-harness.ts` system prompts to push
model scores higher. Uses the evaluate → mutate → re-evaluate → keep/revert loop.

## The File to Edit

`src/main/engine/agent-harness.ts` — contains three prompt builders:

1. `buildNativeSystemPrompt()` — for models with native OpenAI tool calling (Devstral, Qwen, Llama, Gemma 4)
2. `buildSmallModelPrompt()` — for sub-2B models (compact prompt, low temperature)
3. `buildXMLSystemPrompt()` — for models that write XML tool calls (Gemma 3)

## Tuning Loop

1. **Identify the weakest model** — check `ai/data/trainer/harness_evolution.jsonl`
2. **Run baseline** — `npx tsx e2e/train-harness.ts --model "<model-id>"`
3. **Analyze failures** — which assertions fail? Tools not called? Empty response? Wrong data?
4. **Mutate the prompt** — edit the relevant `build*Prompt()` function
5. **Rebuild** — `npx electron-vite build`
6. **Re-evaluate** — run the harness again
7. **Compare** — if score improved, keep. If not, revert.
8. **Log** — results auto-logged to `harness_evolution.jsonl`

## Common Failure Patterns

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Tools not called | Model ignores tool instructions | Stronger "you MUST use tools" language |
| Same tool called 5x | Model repeats instead of proceeding | Add "NEVER repeat a tool call" |
| Empty response after tools | Model generates tool calls but no text | Add "you MUST write a response" |
| Wrong data in response | Model hallucinated instead of reading result | Add "include SPECIFIC data from results" |
| XML in response text | Non-native model writes XML tool calls | Check if model should be on XML path |
| 90s timeout | Model generates 600+ tool calls | Verify MAX_TOOL_CALLS_PER_TURN stream break works |

## Key Constants

In `agent-runner.ts`:
- `MAX_TOOL_ITERATIONS = 5` — max loop iterations per user message
- `MAX_TOOL_CALLS_PER_TURN = 3` — cap per model response (stream breaks at this)

## Don't Break What Works

Before committing prompt changes, re-test Devstral and Qwen 3 4B to ensure
they still hit 100%. Regression on top models is worse than marginal gains on weak ones.
