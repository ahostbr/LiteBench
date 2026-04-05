import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Play, RotateCcw, Square } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

/**
 * TerminalPanel — xterm.js + node-pty powered terminal.
 *
 * Spawns a PowerShell session. User can run `claude` to start
 * Claude Code CLI, which can then orchestrate LiteBench via skills.
 */
export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [started, setStarted] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const startTerminal = useCallback(async () => {
    if (started || connecting) return;
    setConnecting(true);

    try {
      // Spawn PTY
      const { id } = await window.liteBench.pty.create({
        cmd: 'powershell.exe',
        args: ['-NoLogo'],
      });
      ptyIdRef.current = id;

      // Create xterm instance
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

      // Mount to DOM
      if (containerRef.current) {
        term.open(containerRef.current);
        fit.fit();

        // Resize PTY to match terminal dimensions
        window.liteBench.pty.resize(id, term.cols, term.rows);
      }

      // Wire PTY output → xterm
      const unsubData = window.liteBench.pty.onData(id, (data) => {
        term.write(data);
      });

      const unsubExit = window.liteBench.pty.onExit(id, (_code) => {
        term.write('\r\n\x1b[90m[Session ended]\x1b[0m\r\n');
        ptyIdRef.current = null;
        setStarted(false);
      });

      // Wire xterm input → PTY
      term.onData((data) => {
        window.liteBench.pty.write(id, data);
      });

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (fitRef.current && ptyIdRef.current) {
          fitRef.current.fit();
          window.liteBench.pty.resize(ptyIdRef.current, term.cols, term.rows);
        }
      });
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      cleanupRef.current = () => {
        unsubData();
        unsubExit();
        resizeObserver.disconnect();
        term.dispose();
        if (ptyIdRef.current) {
          window.liteBench.pty.destroy(ptyIdRef.current);
          ptyIdRef.current = null;
        }
      };

      setStarted(true);
      setConnecting(false);
      term.focus();
    } catch (err) {
      console.error('[Terminal] Failed to start:', err);
      setConnecting(false);
    }
  }, [started, connecting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  // Refit on visibility
  useEffect(() => {
    if (started && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 100);
    }
  }, [started]);

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
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ padding: '4px 4px 0 4px' }}
      />
    </div>
  );
}
