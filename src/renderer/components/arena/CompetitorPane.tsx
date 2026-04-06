import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@/lib/utils';
import type { BattleCompetitor, CompetitorStatus } from '../../../shared/types';

interface CompetitorState {
  status: CompetitorStatus;
  terminalLog: string;
  filesWritten: string[];
  previewUrl?: string;
}

interface CompetitorPaneProps {
  competitor: BattleCompetitor;
  state: CompetitorState;
  battleId: string;
  index: number;
}

const STATUS_DOT: Record<CompetitorStatus, { color: string; pulse: boolean; label: string }> = {
  pending:   { color: '#71717a', pulse: false, label: 'Pending' },
  running:   { color: '#60a5fa', pulse: true,  label: 'Running' },
  completed: { color: '#4ade80', pulse: false, label: 'Done' },
  failed:    { color: '#f87171', pulse: false, label: 'Failed' },
  dnf:       { color: '#f87171', pulse: false, label: 'DNF' },
};

function useElapsedTimer(status: CompetitorStatus) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'running') {
      startRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (status === 'pending') setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function TerminalView({ log }: { log: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLogRef = useRef('');

  // Mount terminal once
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontSize: 11,
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
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: true,
      scrollback: 2000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    requestAnimationFrame(() => fit.fit());

    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => fitRef.current?.fit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Write only new content as it arrives
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const prev = prevLogRef.current;
    if (log.startsWith(prev)) {
      const delta = log.slice(prev.length);
      if (delta) term.write(delta);
    } else {
      // Log was reset — clear and rewrite
      term.clear();
      term.write(log);
    }
    prevLogRef.current = log;
  }, [log]);

  return <div ref={containerRef} className="flex-1 min-h-0" style={{ padding: '2px' }} />;
}

export function CompetitorPane({ competitor, state, battleId, index }: CompetitorPaneProps) {
  const [activeTab, setActiveTab] = useState<'terminal' | 'preview'>('terminal');
  const dotInfo = STATUS_DOT[state.status];
  const elapsed = useElapsedTimer(state.status);
  const modelLabel = competitor.modelId.split('/').pop() ?? competitor.modelId;
  const isDnf = state.status === 'dnf' || state.status === 'failed';

  // previewUrl is set by the file_written event with the full absolute path
  const previewSrc = state.previewUrl ?? null;

  return (
    <div
      className="h-full flex flex-col rounded-xl overflow-hidden"
      style={{
        border: isDnf
          ? '1px solid rgba(248,113,113,0.3)'
          : '1px solid rgba(255,255,255,0.07)',
        backgroundColor: '#0d0d0e',
        minHeight: 280,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Status dot */}
        <span
          className={cn('w-2 h-2 rounded-full shrink-0', dotInfo.pulse && 'animate-pulse')}
          style={{ backgroundColor: dotInfo.color }}
        />

        {/* Model label */}
        <span className="text-xs font-semibold text-zinc-200 flex-1 truncate">{modelLabel}</span>

        {/* DNF badge */}
        {isDnf && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(248,113,113,0.2)', color: '#f87171' }}
          >
            DNF
          </span>
        )}

        {/* Timer */}
        <span className="text-[10px] font-mono text-zinc-500 shrink-0">{elapsed}</span>
      </div>

      {/* Tabs */}
      <div
        className="flex shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {(['terminal', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium transition-colors capitalize',
              activeTab === tab ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
            )}
            style={activeTab === tab ? { borderBottom: '2px solid var(--accent-color, #c9a24d)' } : {}}
          >
            {tab}
          </button>
        ))}

        {/* Files written indicator */}
        {state.filesWritten.length > 0 && (
          <span className="ml-auto mr-2 self-center text-[10px] text-zinc-600">
            {state.filesWritten.length} file{state.filesWritten.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'terminal' ? (
          <TerminalView log={state.terminalLog} />
        ) : (
          <div className="flex-1 min-h-0 relative">
            {previewSrc ? (
              <iframe
                src={previewSrc}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title={`Preview: ${modelLabel}`}
              />
            ) : (
              <div className="flex-1 h-full flex items-center justify-center">
                <p className="text-xs text-zinc-600">
                  {state.status === 'pending' || state.status === 'running'
                    ? 'Waiting for output...'
                    : 'No index.html generated'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
