/**
 * PTY Handlers — Spawns and manages terminal sessions.
 *
 * Uses node-pty if available (native PTY), falls back to child_process
 * with pipes (works everywhere but no full terminal emulation).
 */
import { ipcMain, type WebContents } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as os from 'os';

// Try node-pty first, fall back to child_process
let ptyModule: typeof import('node-pty') | null = null;
try {
  ptyModule = require('node-pty');
  console.log('[PTY] node-pty loaded');
} catch {
  console.log('[PTY] node-pty not available, using child_process fallback');
}

interface PtySession {
  type: 'pty' | 'process';
  ptyProcess?: ReturnType<NonNullable<typeof ptyModule>['spawn']>;
  childProcess?: ChildProcess;
  sender: WebContents;
}

const sessions = new Map<string, PtySession>();
let sessionCounter = 0;

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:create', (event, opts?: { cwd?: string; cmd?: string; args?: string[] }) => {
    const id = `pty-${++sessionCounter}`;
    const shell = opts?.cmd || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
    const shellArgs = opts?.args || (os.platform() === 'win32' ? ['-NoLogo'] : []);
    const cwd = opts?.cwd || os.homedir();

    if (ptyModule) {
      // Full PTY mode
      try {
        const proc = ptyModule.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd,
          env: process.env as Record<string, string>,
        });

        sessions.set(id, { type: 'pty', ptyProcess: proc, sender: event.sender });

        proc.onData((data: string) => {
          try { event.sender.send(`pty:data:${id}`, data); } catch {}
        });

        proc.onExit(({ exitCode }) => {
          try { event.sender.send(`pty:exit:${id}`, exitCode); } catch {}
          sessions.delete(id);
        });

        return { id, pid: proc.pid };
      } catch (err) {
        console.error('[PTY] node-pty spawn failed, falling back:', (err as Error).message);
        // Fall through to child_process
      }
    }

    // Fallback: child_process with pipes
    const proc = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    sessions.set(id, { type: 'process', childProcess: proc, sender: event.sender });

    proc.stdout?.on('data', (data: Buffer) => {
      try { event.sender.send(`pty:data:${id}`, data.toString()); } catch {}
    });

    proc.stderr?.on('data', (data: Buffer) => {
      try { event.sender.send(`pty:data:${id}`, data.toString()); } catch {}
    });

    proc.on('exit', (code) => {
      try { event.sender.send(`pty:exit:${id}`, code ?? 0); } catch {}
      sessions.delete(id);
    });

    proc.on('error', (err) => {
      try { event.sender.send(`pty:data:${id}`, `\r\nError: ${err.message}\r\n`); } catch {}
    });

    return { id, pid: proc.pid ?? 0 };
  });

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    const session = sessions.get(id);
    if (!session) return;
    if (session.type === 'pty' && session.ptyProcess) {
      session.ptyProcess.write(data);
    } else if (session.type === 'process' && session.childProcess?.stdin) {
      session.childProcess.stdin.write(data);
    }
  });

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id);
    if (!session) return;
    if (session.type === 'pty' && session.ptyProcess) {
      try { session.ptyProcess.resize(cols, rows); } catch {}
    }
    // child_process doesn't support resize — ignore
  });

  ipcMain.handle('pty:destroy', (_event, id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    if (session.type === 'pty' && session.ptyProcess) {
      session.ptyProcess.kill();
    } else if (session.type === 'process' && session.childProcess) {
      session.childProcess.kill();
    }
    sessions.delete(id);
  });
}

export function destroyAllPtySessions(): void {
  for (const [, session] of sessions) {
    try {
      if (session.type === 'pty' && session.ptyProcess) session.ptyProcess.kill();
      if (session.type === 'process' && session.childProcess) session.childProcess.kill();
    } catch {}
  }
  sessions.clear();
}
