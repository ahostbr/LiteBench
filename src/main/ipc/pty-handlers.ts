/**
 * PTY Handlers — Terminal sessions for LiteBench.
 * Ported from LiteSuite's pty-handlers.ts pattern.
 *
 * Uses node-pty for real PTY. Broadcasts data to ALL renderer windows
 * via BrowserWindow.getAllWindows() (not event.sender — survives reloads).
 */
import { ipcMain, BrowserWindow } from 'electron';
import * as os from 'os';

// ── node-pty loading ──────────────────────────────────────────────────────────
// @ts-ignore — node-pty is a native module, may fail to load
let pty: typeof import('node-pty') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  pty = require('node-pty');
  console.log('[PTY] node-pty loaded OK');
} catch (err) {
  console.error('[PTY] node-pty failed:', (err as Error).message);
}

// ── Session tracking ──────────────────────────────────────────────────────────

interface PtySession {
  process: ReturnType<NonNullable<typeof pty>['spawn']>;
}

const sessions = new Map<string, PtySession>();
let counter = 0;

// ── 16ms debounced flush (matches LiteSuite) ──────────────────────────────────

const pendingData = new Map<string, string>();
const flushTimers = new Map<string, NodeJS.Timeout>();

function flushPtyData(id: string): void {
  const data = pendingData.get(id);
  if (!data) return;
  pendingData.delete(id);
  flushTimers.delete(id);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(`pty:data:${id}`, data);
  }
}

function cleanupDebounce(id: string): void {
  const timer = flushTimers.get(id);
  if (timer) clearTimeout(timer);
  flushTimers.delete(id);
  pendingData.delete(id);
}

// ── Broadcast helper ──────────────────────────────────────────────────────────

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

export function registerPtyHandlers(): void {
  if (!pty) {
    // Register a stub that returns an error
    ipcMain.handle('pty:create', () => {
      return { id: '', pid: 0, error: 'node-pty not available. Terminal requires native module rebuild.' };
    });
    return;
  }

  const ptySpawn = pty.spawn;

  ipcMain.handle('pty:create', (_event, opts?: { cwd?: string; cmd?: string; args?: string[] }) => {
    const id = `pty-${++counter}-${Date.now()}`;
    const shell = opts?.cmd || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
    const shellArgs = opts?.args || (os.platform() === 'win32' ? ['-NoLogo'] : []);
    const cwd = opts?.cwd || os.homedir();

    console.log('[PTY] Creating:', { id, shell, cwd });

    try {
      const proc = ptySpawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: process.env as Record<string, string>,
      });

      sessions.set(id, { process: proc });

      // Debounced data forwarding (16ms batches)
      proc.onData((data: string) => {
        pendingData.set(id, (pendingData.get(id) ?? '') + data);
        if (!flushTimers.has(id)) {
          flushTimers.set(id, setTimeout(() => flushPtyData(id), 16));
        }
      });

      proc.onExit(({ exitCode }) => {
        console.log('[PTY] Exit:', { id, exitCode });
        // Flush remaining data
        const timer = flushTimers.get(id);
        if (timer) clearTimeout(timer);
        flushPtyData(id);
        cleanupDebounce(id);
        broadcast(`pty:exit:${id}`, exitCode);
        sessions.delete(id);
      });

      console.log('[PTY] Spawned:', { id, pid: proc.pid });
      return { id, pid: proc.pid };
    } catch (err) {
      console.error('[PTY] Spawn failed:', (err as Error).message);
      return { id: '', pid: 0, error: (err as Error).message };
    }
  });

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    sessions.get(id)?.process.write(data);
  });

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    try { sessions.get(id)?.process.resize(cols, rows); } catch {}
  });

  ipcMain.handle('pty:destroy', (_event, id: string) => {
    cleanupDebounce(id);
    const session = sessions.get(id);
    if (session) {
      session.process.kill();
      sessions.delete(id);
    }
  });
}

export function destroyAllPtySessions(): void {
  for (const [id, session] of sessions) {
    cleanupDebounce(id);
    try { session.process.kill(); } catch {}
  }
  sessions.clear();
}
