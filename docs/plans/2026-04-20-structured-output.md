# Plan: LiteBench Structured Output — Schema-Enforced Benchmarking

## Why This Exists
Models like Qwen 3.5 send empty `{}` tool args despite clear schemas. All models hit 100% on Level 1 tests. We need structured output as both a **model assist layer** (fix weak tool callers at the grammar level) and a **benchmark dimension** (schema compliance scoring to separate good from great).

## Task Description
Add configurable JSON schema enforcement to LiteBench, integrated into both the benchmark runner (backend) and agent runner (Electron), editable in the test case UI.

## Objective
- Per-test-case `response_schema` field with JSON schema
- Model profile overrides for schemas (reuse existing profile system)
- `structured` mode alongside existing `baseline`/`trained`
- Schema validation scoring (configurable: keyword, schema, or both)
- Tool arg schema enforcement in agent runner (fixes empty arg problem)
- JSON editor in TestCaseForm UI

## Fact Dependencies

| Fact | Confidence | Impact if Wrong |
|------|-----------|-----------------|
| LM Studio accepts `response_format.json_schema` on `/v1/chat/completions` | HIGH (scout verified) | Critical — feature doesn't work |
| OpenAI Python SDK supports `response_format` param | HIGH (documented) | Low — easy alternative |
| OpenAI TS SDK supports `response_format` in `create()` | HIGH (scout verified) | Low — easy alternative |
| TestCaseForm uses individual useState hooks | HIGH (scout verified) | Low — just add another hook |
| DB migration is ALTER TABLE | HIGH (SQLite standard) | Low — plan survives |
| Tool arg schemas can be derived from tool-registry.ts `getSchemas()` | HIGH (scout verified format) | Medium — need manual schemas |

## Relevant Files

### Backend (Python)
- `backend/db.py` — Add `response_schema` column to test_cases, `eval_mode` column
- `backend/models.py` — Add fields to TestCaseCreate/Update/Out
- `backend/engine/runner.py` — Pass `response_format` to model call
- `backend/engine/scorer.py` — Add schema validation scoring
- `backend/routers/benchmarks.py` — Thread schema through to runner
- `backend/routers/tests.py` — Handle new fields in CRUD
- `backend/routers/profiles.py` — Schema overrides in profiles
- `backend/main.py` — Migration for new columns

### Frontend (TypeScript/React)
- `src/renderer/components/tests/TestCaseForm.tsx` — Add JSON editor field
- `src/renderer/stores/tests-store.ts` — Add schema field to store

### Agent Runner (TypeScript)
- `src/main/engine/agent-runner.ts` — Schema enforcement on tool args
- `src/main/engine/tool-registry.ts` — Extract schemas for arg enforcement

## Step by Step Tasks

### Phase 1: Database + API (Backend)

**Step 1.1: DB Migration**
File: `backend/db.py` + `backend/main.py`
- Add to test_cases: `response_schema TEXT NOT NULL DEFAULT '{}'`
- Add to test_cases: `eval_mode TEXT NOT NULL DEFAULT 'keyword'` (values: keyword, schema, both)
- Add migration in main.py lifespan for existing DBs

**Step 1.2: Pydantic Models**
File: `backend/models.py`
- Add `response_schema: dict = {}` to TestCaseCreate, TestCaseUpdate, TestCaseOut
- Add `eval_mode: str = "keyword"` to TestCaseCreate, TestCaseUpdate, TestCaseOut

**Step 1.3: Test CRUD API**
File: `backend/routers/tests.py`
- Handle `response_schema` (JSON serialize/deserialize) in POST/PUT endpoints
- Handle `eval_mode` in POST/PUT endpoints

**Step 1.4: Runner — Pass response_format**
File: `backend/engine/runner.py`
- In `call_model()`: accept optional `response_schema: dict` parameter
- When non-empty, add to kwargs: `response_format={"type": "json_schema", "json_schema": {"name": "benchmark_response", "strict": True, "schema": response_schema}}`
- In `run_benchmark_stream()`: thread schema from test case to call_model

**Step 1.5: Scorer — Schema Validation**
File: `backend/engine/scorer.py`
- Add `validate_schema(response: str, schema: dict) -> dict` function
- Parse response as JSON, validate against schema
- Return `{schema_valid: bool, schema_score: float, schema_errors: list}`
- In `score_response()`: when `eval_mode` is "schema" or "both", include schema score
- Scoring logic:
  - `keyword` mode: existing keyword scoring (unchanged)
  - `schema` mode: schema_score only
  - `both` mode: average of keyword_score and schema_score

**Step 1.6: Benchmark Router — Thread Through**
File: `backend/routers/benchmarks.py`
- In stream handler: pass `response_schema` from test case to runner
- When `mode == "structured"`: force response_format even if test case has no schema
- When `mode == "trained"` + profile has schema overrides: use profile's schema

### Phase 2: Frontend UI

**Step 2.1: TestCaseForm — JSON Editor**
File: `src/renderer/components/tests/TestCaseForm.tsx`
- Add `responseSchema` useState with JSON string
- Add textarea field with label "Response Schema (JSON)" 
- Add `evalMode` select dropdown: keyword | schema | both
- Parse/validate JSON on change, show red border if invalid
- Include in onSubmit payload

**Step 2.2: Tests Store**
File: `src/renderer/stores/tests-store.ts` (if exists, or wherever CRUD is)
- Add response_schema and eval_mode to type definitions
- Thread through API calls

### Phase 3: Agent Runner — Tool Arg Enforcement

**Step 3.1: Schema Enforcement on Empty Args**
File: `src/main/engine/agent-runner.ts`
- When tool call has empty/malformed args AND the tool has a schema:
  - Extract the tool's parameter schema from `toolSchemas`
  - Make a secondary `chat.completions.create()` call with `response_format` set to the tool's parameter schema
  - Use the user's last message as context: "Generate the arguments for calling {tool_name} based on this request: {user_message}"
  - Replace the empty args with the schema-enforced response
- This replaces the current regex-based arg fixer (lines 303-322)

**Step 3.2: Tool Result Processing**
File: `src/main/engine/agent-runner.ts`
- After tool returns a result, optionally force the model to structure its interpretation
- Add a processing schema per tool (defined in tool-registry)
- When enabled: insert a system message "Interpret this tool result according to the schema" with response_format
- Thread the structured interpretation back into the conversation

### Phase 4: Rebuild + Test

**Step 4.1: Backend restart + verify API**
- Restart uvicorn, test new fields via curl
- Create a test case with a response_schema via API
- Run a benchmark in "structured" mode

**Step 4.2: Frontend rebuild + verify UI**
- `npx electron-vite build`
- Open app, edit a test case, add a JSON schema
- Verify it saves and loads correctly

**Step 4.3: E2E — Run models with structured output**
- Run the hard test suite with structured mode
- Compare scores: baseline vs structured

## Acceptance Criteria
1. Test cases can have an optional `response_schema` JSON field (stored in DB, editable in UI)
2. Test cases have `eval_mode` selector (keyword/schema/both)
3. `mode: "structured"` on benchmark runs passes `response_format` to LM Studio
4. Schema validation produces a 0-1 score alongside keyword scoring
5. Agent runner uses tool schemas to fix empty args via grammar-enforced secondary call
6. All existing tests continue to work unchanged (backward compatible)

## Validation Commands
```bash
# Backend API test
curl -s http://localhost:8001/api/suites/8/cases | python -c "import sys,json; [print(c.get('response_schema','MISSING')) for c in json.load(sys.stdin)[:1]]"

# Structured benchmark run
curl -s -X POST http://localhost:8001/api/benchmarks/run -H "Content-Type: application/json" -d '{"endpoint_id":1,"suite_id":2,"model_id":"google/gemma-4-26b-a4b","model_name":"Gemma 4","is_thinking":true,"mode":"structured"}'

# E2E hard tests
npx tsx e2e/agent-hard-tests.ts "google/gemma-4-26b-a4b" "Gemma 4"
```

## Remaining Uncertainties
- LM Studio's `strict: true` behavior — may not be fully implemented for all GGUF models
- Performance impact of secondary schema-enforcement calls for tool args
- Whether streaming + response_format work together in LM Studio (may need non-streaming fallback)

## Execution Workflow
1. Worktree → 2. Phase 1 (backend) → commit+push → 3. Phase 2 (frontend) → commit+push → 4. Phase 3 (agent) → commit+push → 5. Phase 4 (test) → 6. Review → 7. Merge

## Execution Echo
After implementing this plan, revisit:
- Did schema enforcement actually improve Qwen 3.5's tool calling?
- Did structured mode scores differentiate models that baseline couldn't?
- What schema patterns work best for different test types?
