# Plan: LiteBench Arena — Website Generation + Head-to-Head Battles

## Task Description

Add a full Arena system to LiteBench where local AI models compete head-to-head by generating websites from the same prompt. Models work simultaneously, their output renders in live iframe previews, and winners are determined by human pick + auto-metrics + ELO ratings. Port BattleOrchestrator and ArenaLayout from LiteGauntlet. New `write_file` tool enables models to produce persistent HTML/CSS/JS output. Persistent gallery stores all battles with full replay. This is the LiteGauntlet-meets-LiteBench fusion — eventually merges into LiteSuite.

## Objective

**Success criteria:**
1. User opens Arena panel, picks 2+ models, types a prompt (or picks a preset), clicks "Battle"
2. All models generate simultaneously — terminal + live iframe preview per competitor pane
3. User picks a winner (human judge), auto-metrics score each site (valid HTML, responsive, a11y, Lighthouse perf, LLM aesthetic), ELO ratings update
4. Gallery persists across restarts — user can revisit any battle
5. Stress test: 8 simultaneous models, grid adapts, no crashes
6. Full E2E verification with real local models

## Problem Statement

LiteBench proves local models can use tools. LiteGauntlet proves models can compete head-to-head. Neither app lets models **generate visible creative output** and get compared. The `/mockup` skill shows Claude can produce stunning websites — but can a 4B local model? Can a 0.8B? This answers that question definitively, with data.

## Solution Approach

Port LiteGauntlet's battle infrastructure (orchestrator, arena layout, competitor panes) into LiteBench's Electron shell. Add a `write_file` tool so models can produce HTML output. Render results in sandboxed iframes. Score with a multi-layer judging pipeline (human + auto + LLM + ELO). Store everything in SQLite.

## Relevant Files

### CREATE
| File | Purpose |
|------|---------|
| `src/main/engine/battle-orchestrator.ts` | Battle lifecycle: configure → build → judge → results. Ported from LiteGauntlet |
| `src/main/engine/competitor-runner.ts` | Per-competitor agent loop — runs agent-harness with write_file tool, streams events |
| `src/main/engine/metrics-collector.ts` | Post-battle scoring: HTML validity, responsive, a11y, perf, LLM aesthetic |
| `src/main/engine/elo-system.ts` | ELO rating calculator + SQLite persistence |
| `src/main/ipc/arena-handlers.ts` | IPC bridge: start-battle, cancel, get-gallery, get-elo-ratings |
| `src/main/db/battles-db.ts` | SQLite schema + queries for battles, competitors, scores, ELO, gallery |
| `src/renderer/stores/arena-store.ts` | Zustand store: active battle state, competitor statuses, gallery |
| `src/renderer/components/arena/ArenaPanel.tsx` | Top-level panel: battle config + arena grid + results |
| `src/renderer/components/arena/BattleConfig.tsx` | Model picker (multi-select), prompt input, preset gallery, "Battle" button |
| `src/renderer/components/arena/ArenaGrid.tsx` | Responsive grid: layout templates for 2, 4, 8, N competitors |
| `src/renderer/components/arena/CompetitorPane.tsx` | Per-model pane: terminal tab + iframe preview tab + status badge + timer |
| `src/renderer/components/arena/JudgingPanel.tsx` | Post-battle: side-by-side previews, "Pick Winner" buttons, auto-metric scores, ELO delta |
| `src/renderer/components/arena/GalleryView.tsx` | Battle history: cards with thumbnails, scores, ELO changes, click to replay |
| `src/renderer/components/arena/PresetChallenges.tsx` | Seeded challenge cards: "Landing page", "Portfolio", "Dashboard", etc. |
| `src/renderer/components/arena/EloLeaderboard.tsx` | Model rankings by ELO, win rate, battles played |

### MODIFY
| File | Purpose |
|------|---------|
| `src/main/engine/tool-registry.ts` | Add `write_file` tool (#9) |
| `src/main/engine/tool-executor.ts` | Handle write_file execution (write to battle output dir) |
| `src/main/engine/agent-harness.ts` | Add write_file to system prompts and tool schemas |
| `src/main/index.ts` | Register arena IPC handlers |
| `src/preload/index.ts` | Add `arena` namespace to preload bridge |
| `src/renderer/api/client.ts` | Add `arena` namespace wrapping preload |
| `src/renderer/stores/workspace-store.ts` | Add `'arena'` to PanelType union |
| `src/renderer/components/workspace/ActivityBar.tsx` | Add Arena icon (Swords) |
| `src/renderer/components/workspace/WorkspaceArea.tsx` | Import ArenaPanel, add case |
| `src/shared/types.ts` | Add Battle, Competitor, BattlePhase, EloRating, MetricResult types |

## Team Orchestration

You operate as the team lead and orchestrate the team to execute this plan.
You NEVER write code directly — you use Task and Task* tools to deploy team members.

### Team Members

| Role | Model | Focus |
|------|-------|-------|
| **architect** | Opus (plan-mode) | Battle orchestrator, type system, database schema, IPC contracts |
| **backend-1** | Sonnet | tool-registry, tool-executor, write_file, competitor-runner, agent-harness updates |
| **backend-2** | Sonnet | battle-orchestrator, metrics-collector, elo-system, battles-db, arena-handlers |
| **frontend-1** | Sonnet | ArenaPanel, BattleConfig, ArenaGrid, CompetitorPane, PresetChallenges |
| **frontend-2** | Sonnet | JudgingPanel, GalleryView, EloLeaderboard, arena-store, workspace registration |
| **verifier** | Sonnet | E2E tests, integration tests, stress test with 8 models |

## Step by Step Tasks

### Step 1: Shared Types + Database Schema
**Owner:** architect
**Files:** `src/shared/types.ts`, `src/main/db/battles-db.ts`

Add types:
```typescript
BattlePhase = 'configuring' | 'building' | 'judging' | 'results'
BattleStatus = 'active' | 'completed' | 'cancelled'
CompetitorStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dnf'

Battle { id, prompt, presetId?, phase, status, competitors[], createdAt, completedAt? }
BattleCompetitor { id, battleId, endpointId, modelId, status, outputDir, startTime?, endTime?, score?, eloChange? }
MetricResult { name, score (0-100), details?, weight }
EloRating { modelKey, rating (default 1500), wins, losses, draws, battleCount }
BattleEvent (discriminated union): competitor_start | text_delta | tool_call | file_written | competitor_done | battle_done | metrics_ready | error
```

SQLite schema (battles.db):
- `battles` — id, prompt, preset_id, phase, status, winner_id, created_at, completed_at
- `competitors` — id, battle_id, endpoint_id, model_id, status, output_dir, start_time, end_time, terminal_log
- `scores` — id, competitor_id, metric_name, score, weight, details_json
- `elo_ratings` — model_key (endpoint+model), rating, wins, losses, draws, battle_count, last_updated
- `gallery` — battle_id FK, thumbnail_path, title (from prompt), tags

**Depends on:** Nothing
**Blocks:** All other steps

### Step 2: write_file Tool
**Owner:** backend-1
**Files:** `src/main/engine/tool-registry.ts`, `src/main/engine/tool-executor.ts`, `src/main/engine/agent-harness.ts`

New tool registration:
```typescript
{
  name: 'write_file',
  description: 'Write content to a file in the current output directory. Use for creating HTML, CSS, JS files.',
  parameters: {
    filename: { type: 'string', description: 'File name (e.g. index.html, styles.css)' },
    content: { type: 'string', description: 'Full file content to write' }
  },
  executor: async (args, context) => {
    // context.outputDir set by battle orchestrator (or temp dir for agent chat)
    // Validate: no path traversal, allowed extensions only (.html, .css, .js, .svg, .json)
    // Write file, return confirmation with file path
  }
}
```

Update agent-harness.ts system prompts to mention write_file.
Update XML schema builder for small models.

**Depends on:** Step 1 (types)
**Blocks:** Steps 4, 5

### Step 3: Battle Orchestrator + Competitor Runner
**Owner:** backend-2
**Files:** `src/main/engine/battle-orchestrator.ts`, `src/main/engine/competitor-runner.ts`

Port from LiteGauntlet's BattleOrchestrator pattern:

**BattleOrchestrator:**
- `startBattle(config: { prompt, competitors: {endpointId, modelId}[], presetId? })`
- Creates battle in DB, creates output dirs (`battles/<battle-id>/competitor-<n>/`)
- Spawns CompetitorRunners in parallel
- Tracks phase transitions: configuring → building → judging → results
- Emits BattleEvents via callback
- Handles cancellation via AbortController
- Default 5-minute timeout per competitor (configurable)
- On all competitors done → trigger metrics collection → emit battle_done

**CompetitorRunner:**
- Wraps agent-runner.ts with write_file context (outputDir set)
- System prompt: "You are generating a website. Use write_file to create HTML/CSS/JS files. Start with index.html."
- Streams text_delta + tool_call events back to orchestrator
- On completion: checks if index.html exists in outputDir
- On failure: marks DNF, preserves partial output

**Depends on:** Step 1 (types), Step 2 (write_file)
**Blocks:** Step 5

### Step 4: Metrics Collector + ELO System
**Owner:** backend-2
**Files:** `src/main/engine/metrics-collector.ts`, `src/main/engine/elo-system.ts`

**MetricsCollector:**
- `collectMetrics(outputDir, endpointConfig?): Promise<MetricResult[]>`
- HTML Validity: parse with htmlparser2, check for errors, score 0-100
- Renders Without Errors: load in hidden BrowserView, check console.error count
- Responsive: test at 3 viewports (mobile 375px, tablet 768px, desktop 1440px), check overflow
- Accessibility: basic checks (contrast via color parsing, alt text on images, semantic HTML)
- Performance: file size, asset count, inline vs external, estimated load time
- LLM Aesthetic Judge: send screenshot + HTML to user-configured judge endpoint, parse score
- Each metric returns { name, score: 0-100, weight, details }

**ELO System:**
- Standard ELO with K-factor 32
- `updateElo(winnerId, loserId, isDraw?): { winnerDelta, loserDelta }`
- For multi-competitor battles: round-robin pairwise from human pick order
- Persist to elo_ratings table
- `getLeaderboard(): EloRating[]` sorted by rating desc

**Depends on:** Step 1 (types + DB)
**Blocks:** Step 6

### Step 5: IPC Handlers + Preload Bridge
**Owner:** backend-1
**Files:** `src/main/ipc/arena-handlers.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/api/client.ts`

IPC channels:
- `bench:arena:start-battle` (invoke) → creates battle, returns battleId
- `bench:arena:cancel-battle` (invoke) → aborts via AbortController
- `bench:arena:get-gallery` (invoke) → returns battle history from DB
- `bench:arena:get-battle` (invoke) → returns single battle with competitors + scores
- `bench:arena:get-elo` (invoke) → returns ELO leaderboard
- `bench:arena:get-presets` (invoke) → returns seeded challenges
- `bench:arena:judge` (invoke) → human picks winner, triggers ELO update
- Events via `sender.send('bench:arena:event', BattleEvent)`

Preload bridge: `arena` namespace with all of the above.
API client: `arena` namespace wrapping preload.

**Depends on:** Step 1, Step 3
**Blocks:** Step 6

### Step 6: Arena Store (Zustand)
**Owner:** frontend-2
**Files:** `src/renderer/stores/arena-store.ts`

```typescript
interface ArenaState {
  // Battle config
  selectedModels: { endpointId: string; modelId: string }[]
  prompt: string
  presetId: string | null

  // Active battle
  activeBattle: Battle | null
  competitorStates: Map<string, { status, terminalLog, filesWritten, previewUrl? }>
  phase: BattlePhase

  // Gallery
  gallery: Battle[]
  eloLeaderboard: EloRating[]

  // Actions
  addModel, removeModel, setPrompt, selectPreset
  startBattle, cancelBattle
  pickWinner(competitorId)
  loadGallery, loadElo
  _handleBattleEvent(event)
}
```

No persist (battles in SQLite, not localStorage).

**Depends on:** Step 1, Step 5
**Blocks:** Step 7

### Step 7: Arena UI Components
**Owner:** frontend-1 + frontend-2

**frontend-1 builds:**

**ArenaPanel.tsx** — Top-level panel (NO ScrollWrap). Three states:
1. Config mode: BattleConfig + PresetChallenges
2. Battle mode: ArenaGrid with CompetitorPanes
3. Results mode: JudgingPanel

**BattleConfig.tsx** — Model multi-picker (reuse endpoint discovery from agent chat), free-form prompt textarea, preset challenge cards below, "Battle" button (disabled until 2+ models selected).

**ArenaGrid.tsx** — Responsive CSS grid. Layout templates:
- 2: side-by-side (1x2)
- 3: 2 top + 1 full-width bottom
- 4: 2x2
- 5-6: 3x2
- 7-8: 4x2
- 9+: auto-fill with minmax(400px, 1fr)

**CompetitorPane.tsx** — Header: model name + status badge (colored dot) + elapsed timer. Two tabs: Terminal (xterm.js streaming model output) + Preview (sandboxed iframe pointing to `file:///battles/<id>/competitor-<n>/index.html`). On failure: show partial output, red "DNF" badge.

**PresetChallenges.tsx** — Grid of cards with challenge title, description, difficulty badge. Seeded data:
- "Landing Page" — "Build a modern SaaS landing page with hero, features, pricing, CTA"
- "Portfolio" — "Create a developer portfolio with projects, about, contact form"
- "Dashboard" — "Design an analytics dashboard with charts, stats cards, sidebar nav"
- "E-Commerce" — "Build a product listing page with filters, cart, product cards"
- "Blog" — "Create a blog homepage with article cards, categories, search"
- "Restaurant" — "Design a restaurant website with menu, reservations, gallery"

**frontend-2 builds:**

**JudgingPanel.tsx** — Post-battle view. Side-by-side full-size iframe previews (click to expand any one). Auto-metric scores displayed per competitor as bar charts. "Pick Winner" button per competitor. ELO delta preview ("Qwen 3 4B: +18, Gemma 4: -18"). Confirm button finalizes.

**GalleryView.tsx** — Battle history cards. Each card: prompt excerpt, model names, winner badge, date, thumbnail (screenshot of winning site). Click opens battle detail with full replays.

**EloLeaderboard.tsx** — Table: rank, model name, ELO rating, W/L/D, battle count, trend arrow (up/down from last 5). Gold/silver/bronze styling for top 3.

**Depends on:** Step 6
**Blocks:** Step 8

### Step 8: Workspace Registration
**Owner:** frontend-2
**Files:** `workspace-store.ts`, `ActivityBar.tsx`, `WorkspaceArea.tsx`

- Add `'arena'` to PanelType union + PANEL_TITLES
- Add Swords icon (from lucide-react) to panelIcons in ActivityBar
- Import ArenaPanel (React.lazy!), add case in WorkspaceArea

**Depends on:** Step 7
**Blocks:** Step 9

### Step 9: Preset Challenges Seeder
**Owner:** backend-2
**Files:** `src/main/db/battles-db.ts` (extend)

Seed preset_challenges table on first launch:
- 6 challenges (landing, portfolio, dashboard, ecommerce, blog, restaurant)
- Each has: id, title, description, difficulty (easy/medium/hard), system_prompt_addendum
- Difficulty affects scoring weight: hard challenges = more ELO at stake

**Depends on:** Step 1
**Blocks:** Nothing (can run parallel with Steps 2-8)

### Step 10: E2E Testing + Verification
**Owner:** verifier
**Files:** `e2e/arena-battles.test.ts`

Tests:
1. Arena panel opens from activity bar
2. Model picker discovers endpoints, allows multi-select
3. Preset challenge cards render, clicking one fills prompt
4. Start battle with 2 models → both competitors start, terminal streams
5. write_file tool produces index.html in output dir
6. iframe preview loads generated site
7. Battle completes → judging panel appears with previews
8. Pick winner → ELO updates in leaderboard
9. Gallery shows battle history, click reopens
10. Stress: 8 models simultaneously, grid adapts, no OOM
11. Failed model: shows partial output, marked DNF
12. Cancel mid-battle: clean abort, no orphan processes
13. Auto-metrics: valid HTML score, responsive check, a11y check
14. LLM judge: sends to configured endpoint, returns score
15. Gallery persists across app restart

**Depends on:** Steps 1-8 complete
**Blocks:** Nothing

## Acceptance Criteria

1. **Arena panel** accessible from activity bar with Swords icon
2. **Battle config** lets user pick 2+ models from any endpoint, type prompt or pick preset
3. **Simultaneous generation** — all models work in parallel, terminal + live preview per pane
4. **write_file tool** — models produce persistent HTML/CSS/JS in battle output dirs
5. **Grid adapts** — layout templates for 2, 4, 8, N competitors
6. **Judging** — human pick winner + auto-metrics (validity, responsive, a11y, perf, LLM aesthetic)
7. **ELO system** — ratings update after each battle, leaderboard shows rankings
8. **Gallery** — persistent battle history with thumbnails, replay capability
9. **Failure handling** — DNF models show partial output, others continue
10. **Stress test** — 8 simultaneous models without crashes
11. **Gallery persists** across app restart (SQLite)

## Validation Commands

```bash
# Build check
cd C:/Projects/LiteBench && pnpm build

# Type check
pnpm tsc --noEmit

# E2E tests
pnpm test:e2e -- --grep "arena"

# Manual verification
pnpm dev
# → Click Arena icon → Pick 2 models → Type "Build a landing page" → Click Battle
# → Watch terminals stream → See previews render → Pick winner → Check ELO
# → Close and reopen app → Gallery shows previous battle
```

## Execution Workflow

1. Create worktree → `superpowers:using-git-worktrees`
2. Write tests → `superpowers:test-driven-development`
3. Implement (via /spawnteam parallel dispatch)
4. Debug failures → `superpowers:systematic-debugging`
5. Verify → `superpowers:verification-before-completion`
6. Review → `superpowers:requesting-code-review`
7. Finish branch → `superpowers:finishing-a-development-branch`

## Assumptions Made

- A1. [DB] New `battles.db` SQLite for ELO, battle history, scores, gallery metadata
- A2. [TOOLS] `write_file` is tool #9, writes to per-battle output dir (`battles/<id>/competitor-<n>/`)
- A3. [PORT] LiteGauntlet code adapted to LiteBench's pnpm/Vite/Electron stack (not copy-paste)
- A4. [LIGHTHOUSE] Lightweight JS metrics (htmlparser2, viewport checks), not full Chrome Lighthouse binary
- A5. [JUDGE] LLM judge calls any user-configured endpoint with scoring prompt + HTML content
- A6. [PRESETS] Preset challenges are seeded data shipped with app, not fetched remotely

## Notes

- This is the LiteBench + LiteGauntlet fusion Ryan identified. Both apps solve adjacent problems — this unifies them.
- The Arena panel coexists with the existing Agent Chat panel. Agent Chat = free-form conversation with tools. Arena = competitive website generation.
- Eventually both panels port to LiteSuite as part of the mega-app consolidation.
- The `write_file` tool also benefits regular Agent Chat — models can produce files outside of battles too.
- LLM aesthetic judge reuses the existing endpoint/model picker infrastructure — no new auth or API layer needed.
- ELO K-factor 32 is standard for new players with high volatility. Consider reducing to 16 after 30+ battles per model.

## Reusable Source Code (from LiteGauntlet)

| Source | Target | Adaptation |
|--------|--------|------------|
| `battle-orchestrator.ts` | `battle-orchestrator.ts` | Replace CLI process spawning with agent-harness calls |
| `competitor-manager.ts` | `competitor-runner.ts` | Replace PTY shell with agent-runner streaming loop |
| `ArenaLayout.tsx` | `ArenaGrid.tsx` | Adapt grid logic, keep responsive templates |
| `CompetitorPane.tsx` | `CompetitorPane.tsx` | Replace Gauntlet terminal with LiteBench xterm, add iframe |
| `metrics-collector.ts` | `metrics-collector.ts` | Replace build-pass checks with HTML/CSS quality metrics |
| `progress-tracker.ts` | (inline in orchestrator) | Sentinel detection → completion callback |
