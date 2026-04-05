# LiteBench Agent Handoff — Browser Persistence Next

## Context

LiteBench is production-ready. DM sent to Matt Wolfe. 13 models baselined, 6 at 100%. NSIS installer built. Welcome panel, recommended models, terminal, skills all shipped.

## What You're Picking Up

### Browser Session Persistence

The embedded browser (WebContentsView) loses cookies/sessions on restart. If a user signs into Google, it's gone next launch. Need to implement persistent sessions like LiteSuite does.

**Where to look:**
- `C:/Projects/LiteSuite/apps/desktop/src/litesuite/` — check how LiteSuite handles WebContentsView sessions, partitions, and cookie persistence
- `C:/Projects/LiteBench/src/main/browser-manager.ts` — current implementation, no persistence
- Electron's `session.fromPartition('persist:browser')` is the standard pattern
- Cookies, localStorage, and IndexedDB should all persist across app restarts

**Current browser-manager.ts approach:**
- Creates WebContentsView with `contextIsolation: true, nodeIntegration: false, sandbox: true`
- No partition specified → uses default in-memory session
- Fix: add `partition: 'persist:litebench-browser'` to webPreferences

### Terminal PTY

- Einstein's `scripts/rebuild-native.mjs` patches winpty.gyp for pnpm + Electron ABI
- Feynman's fix: two-phase xterm init (set started=true, then attach in useEffect)
- Da Vinci's fix: BrowserWindow.getAllWindows() broadcast + 16ms debounce
- Needs testing on a clean install (run `pnpm install` from scratch)

### Still TODO

1. Browser session persistence (above)
2. Test terminal on clean install
3. Make repo public: `gh repo edit ahostbr/LiteBench --visibility public`
4. Record demo video for Matt Wolfe
5. Port to LiteSuite (keep chat panel GUI)

## Key Files

| File | Role |
|------|------|
| `src/main/browser-manager.ts` | WebContentsView — ADD PERSISTENT SESSION |
| `src/main/engine/agent-harness.ts` | System prompt builder (native/XML/small) |
| `src/main/engine/agent-runner.ts` | Streaming tool-use loop with stream-break |
| `src/main/engine/tool-registry.ts` | Tool schemas (pccontrol REMOVED) |
| `src/main/engine/tool-executor.ts` | Python subprocess (getPythonPath + shell) |
| `src/main/ipc/pty-handlers.ts` | Terminal PTY (node-pty + NAPI prebuilds) |
| `src/renderer/components/terminal/TerminalPanel.tsx` | Two-phase xterm init |
| `src/renderer/components/browser/BrowserPanel.tsx` | Hides WebContentsView on tab switch |
| `src/renderer/components/workspace/WelcomePanel.tsx` | Default panel on launch |
| `scripts/rebuild-native.mjs` | Einstein's winpty.gyp patcher |
| `.claude/skills/` | 4 skills: bench-orchestrator, model-download, harness-tune, train |
| `e2e/train-harness.ts` | Training evaluation script |

## Don't Forget

- Use **pnpm** (not Bun)
- pccontrol is **REMOVED** — do not re-add
- `browser_navigate` returns `{url, title}` — awaits did-finish-load
- WebContentsView hides when Browser tab not active (BrowserPanel watches activePanelId)
- Terminal: xterm.open() MUST be called AFTER the div exists (useEffect, not startTerminal)
- DM sent to Matt Wolfe via X — 4 messages (use Shift+Enter for single message next time)
- LiteSuite models at `~/.litesuite/llm/models/`, LM Studio at `~/.lmstudio/models/`
