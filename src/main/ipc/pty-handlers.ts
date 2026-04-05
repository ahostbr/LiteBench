/**
 * PTY Handlers — Spawns and manages pseudo-terminal sessions.
 * Used by the Terminal panel to run shells (PowerShell, Claude Code CLI, etc.)
 */
import { ipcMain, type WebContents } from 'electron';
import * as os from 'os';
import * as path from 'path';

// node-pty is a native module — require at runtime
let pty: typeof import('node-pty');
try {
  pty = require('node-pty');
} catch (err) {
  console.error('[PTY] Failed to load node-pty:', err);
}

interface PtySession {
  process: ReturnType<typeof pty.spawn>;
  sender: WebContents;
}

const sessions = new Map<string, PtySession>();
let sessionCounter = 0;

export function registerPtyHandlers(): void {
  if (!pty) {
    console.warn('[PTY] node-pty not available — terminal panel disabled');
    return;
  }

  // Create a new PTY session
  ipcMain.handle('pty:create', (event, opts?: { cwd?: string; cmd?: string; args?: string[] }) => {
    const id = `pty-${++sessionCounter}`;

    // Default to PowerShell on Windows, bash elsewhere
    const shell = opts?.cmd || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
    const shellArgs = opts?.args || (os.platform() === 'win32' ? ['-NoLogo'] : []);
    const cwd = opts?.cwd || os.homedir();

    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: process.env as Record<string, string>,
    });

    sessions.set(id, { process: proc, sender: event.sender });

    // Forward PTY output to renderer
    proc.onData((data: string) => {
      try {
        event.sender.send(`pty:data:${id}`, data);
      } catch {
        // Renderer destroyed
      }
    });

    proc.onExit(({ exitCode }) => {
      try {
        event.sender.send(`pty:exit:${id}`, exitCode);
      } catch {
        // Renderer destroyed
      }
      sessions.delete(id);
    });

    return { id, pid: proc.pid };
  });

  // Write data to PTY (user keystrokes)
  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    const session = sessions.get(id);
    if (session) session.process.write(data);
  });

  // Resize PTY
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id);
    if (session) {
      try {
        session.process.resize(cols, rows);
      } catch {
        // Ignore resize errors
      }
    }
  });

  // Destroy PTY session
  ipcMain.handle('pty:destroy', (_event, id: string) => {
    const session = sessions.get(id);
    if (session) {
      session.process.kill();
      sessions.delete(id);
    }
  });
}

/** Cleanup all PTY sessions on app quit */
export function destroyAllPtySessions(): void {
  for (const [id, session] of sessions) {
    try {
      session.process.kill();
    } catch {
      // Already dead
    }
  }
  sessions.clear();
}
