import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Play, TerminalSquare } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { SkillsDropdown } from './SkillsDropdown';

/**
 * TerminalPanel — xterm.js + node-pty powered terminal.
 *
 * CRITICAL FIX (Feynman review): xterm.open() must be called AFTER the
 * container div is in the DOM. The async startTerminal() sets started=true
 * to render the div, then a useEffect attaches xterm after React paints.
 */
export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [started, setStarted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ptyId, setPtyId] = useState<string | null>(null);

  // Phase 1: Spawn PTY, flip to started (renders the container div)
  const startTerminal = useCallback(async () => {
    if (started || connecting) return;
    setConnecting(true);
    setError(null);

    try {
      const result = await window.liteBench.pty.create({
        cmd: 'powershell.exe',
        args: ['-NoLogo'],
      });

      if (!result.id || result.error) {
        throw new Error(result.error || 'Failed to create terminal session');
      }

      // Store PTY ID and flip to started — React will render the container div
      setPtyId(result.id);
      setStarted(true);
      setConnecting(false);
    } catch (err) {
      console.error('[Terminal] Failed to start:', err);
      setConnecting(false);
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [started, connecting]);

  // Phase 2: Attach xterm AFTER the container div is in the DOM
  useEffect(() => {
    if (!started || !ptyId || !containerRef.current) return;

    const term = new XTerm({
      fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Code", "JetBrains Mono", monospace',
      theme: {
        background: '#0a0a0b',
        foreground: '#e8e4dc',
        cursor: '#c9a24d',
        selectionBackground: '#c9a24d40',
        black: '#1a1a1a',
        red: '#e85450',
        green: '#4ade80',
        yellow: '#c9a24d',
        blue: '#60a5fa',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#e8e4dc',
        brightBlack: '#6a6560',
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#e0b85a',
        brightBlue: '#93c5fd',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#f5f5f4',
      },
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;

    // NOW the div exists — attach xterm to it
    term.open(containerRef.current);

    // ── Copy/Paste handling (from Kuroryuu Terminal.tsx) ──────────────────────
    // xterm.js doesn't handle clipboard natively — we need custom key handlers.
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+C: copy if text selected, otherwise pass through as SIGINT
      if (event.type === 'keydown' && event.ctrlKey && event.key === 'c') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
          term.clearSelection();
          return false; // Prevent default (don't send SIGINT when copying)
        }
        return true; // No selection — let it through as SIGINT
      }

      // Ctrl+V: paste from clipboard into terminal
      if (event.type === 'keydown' && event.ctrlKey && event.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (text) window.liteBench.pty.write(ptyId, text);
        }).catch(() => {});
        return false; // Prevent default
      }

      // Ctrl+A: select all terminal content
      if (event.type === 'keydown' && event.ctrlKey && event.key === 'a') {
        term.selectAll();
        return false;
      }

      return true; // All other keys pass through normally
    });

    // Wait one paint cycle for flex layout to compute dimensions
    requestAnimationFrame(() => {
      fit.fit();
      window.liteBench.pty.resize(ptyId, term.cols, term.rows);
    });

    // Wire PTY output → xterm
    const unsubData = window.liteBench.pty.onData(ptyId, (data: string) => {
      term.write(data);
    });

    const unsubExit = window.liteBench.pty.onExit(ptyId, (_code: number) => {
      term.write('\r\n\x1b[90m[Session ended]\x1b[0m\r\n');
      setPtyId(null);
      setStarted(false);
    });

    // Wire xterm input → PTY
    term.onData((data: string) => {
      window.liteBench.pty.write(ptyId, data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitRef.current) {
        fitRef.current.fit();
        window.liteBench.pty.resize(ptyId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(containerRef.current);

    term.focus();

    // Cleanup on unmount or ptyId change
    return () => {
      unsubData();
      unsubExit();
      resizeObserver.disconnect();
      term.dispose();
      if (ptyId) window.liteBench.pty.destroy(ptyId);
    };
  }, [started, ptyId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!started && !connecting) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0b' }}>
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
            Terminal
          </h3>
          <p className="text-[11px] max-w-sm leading-relaxed" style={{ color: 'var(--text-muted, #7a756d)' }}>
            Launch a terminal to run Claude Code CLI. Claude can orchestrate
            model testing, download models, run the harness, and analyze results.
          </p>
          <p className="text-[10px] mt-2 font-mono" style={{ color: 'var(--text-muted, #7a756d)' }}>
            Type <span style={{ color: 'var(--accent, #c9a24d)' }}>claude</span> to start the AI orchestrator
          </p>
        </div>
        {error && (
          <p className="text-[11px] max-w-sm text-center" style={{ color: '#e85450' }}>
            {error}
          </p>
        )}
        <button
          onClick={startTerminal}
          className="px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium text-sm transition-all hover:opacity-90"
          style={{
            backgroundColor: 'var(--accent, #c9a24d)',
            color: 'var(--color-void, #0a0a0b)',
          }}
        >
          <Play className="w-4 h-4" />
          Start Terminal
        </button>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ backgroundColor: '#0a0a0b' }}>
        <span className="text-sm" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Spawning terminal...
        </span>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: '#0a0a0b' }}>
      {/* Terminal header with skills dropdown */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <TerminalSquare className="w-3.5 h-3.5" style={{ color: 'var(--text-muted, #7a756d)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Terminal
        </span>
        <SkillsDropdown ptyId={ptyId} />
        <div className="flex-1" />
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ padding: '4px 4px 0 4px' }}
      />
    </div>
  );
}
