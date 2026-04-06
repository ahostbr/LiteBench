import { useState, useEffect, useRef } from 'react';
import { Trophy, CheckCircle2, X, Maximize2, Minimize2 } from 'lucide-react';
import { useArenaStore } from '@/stores/arena-store';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import type { Battle, BattleCompetitor, MetricResult } from '../../../shared/types';

const METRIC_COLORS: Record<string, string> = {
  validity: 'bg-blue-500',
  responsive: 'bg-purple-500',
  a11y: 'bg-green-500',
  perf: 'bg-yellow-500',
  aesthetic: 'bg-pink-500',
};

function MetricBar({ metric }: { metric: MetricResult }) {
  const color = METRIC_COLORS[metric.name] ?? 'bg-zinc-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-zinc-400">
        <span className="capitalize">{metric.name}</span>
        <span className="text-zinc-300 font-medium">{metric.score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800">
        <div
          className={cn('h-1.5 rounded-full transition-all duration-500', color)}
          style={{ width: `${metric.score}%` }}
        />
      </div>
    </div>
  );
}

interface CompetitorPreviewProps {
  competitor: BattleCompetitor;
  isWinner: boolean;
  isPendingWinner: boolean;
  previewUrl?: string;
  metrics?: MetricResult[];
  eloDelta?: number;
  onPickWinner: () => void;
  readOnly: boolean;
}

function CompetitorPreview({
  competitor,
  isWinner,
  isPendingWinner,
  previewUrl,
  metrics,
  eloDelta,
  onPickWinner,
  readOnly,
}: CompetitorPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        className={cn(
          'flex flex-col rounded-lg border overflow-hidden transition-all',
          isWinner
            ? 'border-yellow-500/60 bg-yellow-500/5'
            : isPendingWinner
            ? 'border-[var(--accent-color)]/60 bg-[var(--accent-color)]/5'
            : 'border-zinc-700 bg-zinc-900',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
          {isWinner && <Trophy size={14} className="text-yellow-400 shrink-0" />}
          <span className="text-sm font-medium text-zinc-200 truncate flex-1">
            {competitor.modelId}
          </span>
          {eloDelta !== undefined && (
            <span
              className={cn(
                'text-xs font-mono font-semibold shrink-0',
                eloDelta > 0 ? 'text-green-400' : eloDelta < 0 ? 'text-red-400' : 'text-zinc-500',
              )}
            >
              {eloDelta > 0 ? '+' : ''}{eloDelta} ELO
            </span>
          )}
          <button
            onClick={() => setExpanded(true)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            title="Expand preview"
          >
            <Maximize2 size={13} />
          </button>
        </div>

        {/* Preview iframe */}
        <div className="relative flex-1 min-h-0 bg-zinc-950" style={{ height: '280px' }}>
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
              title={`Preview: ${competitor.modelId}`}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
              No output generated
            </div>
          )}
        </div>

        {/* Metrics */}
        {metrics && metrics.length > 0 && (
          <div className="px-3 py-2 border-t border-zinc-800 space-y-1.5">
            {metrics.map((m) => (
              <MetricBar key={m.name} metric={m} />
            ))}
          </div>
        )}

        {/* Pick Winner button */}
        {!readOnly && !isWinner && (
          <div className="px-3 py-2 border-t border-zinc-800">
            <button
              onClick={onPickWinner}
              className={cn(
                'w-full py-1.5 rounded text-xs font-medium transition-all',
                isPendingWinner
                  ? 'bg-[var(--accent-color)] text-zinc-900 hover:opacity-90'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
              )}
            >
              {isPendingWinner ? (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={12} />
                  Selected as Winner
                </span>
              ) : (
                'Pick as Winner'
              )}
            </button>
          </div>
        )}
        {isWinner && (
          <div className="px-3 py-2 border-t border-zinc-800">
            <div className="w-full py-1.5 rounded text-xs font-medium text-center bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <span className="flex items-center justify-center gap-1.5">
                <Trophy size={12} />
                Winner
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative w-full h-full max-w-6xl max-h-full bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
              <span className="text-sm font-medium text-zinc-200 flex-1">{competitor.modelId}</span>
              <button
                onClick={() => setExpanded(false)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <Minimize2 size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title={`Expanded: ${competitor.modelId}`}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600">
                  No output generated
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface JudgingPanelProps {
  readOnly?: boolean;
  /** When provided, renders this battle directly instead of reading from the store. */
  battle?: Battle;
}

export function JudgingPanel({ readOnly = false, battle: battleProp }: JudgingPanelProps) {
  const storeActiveBattle = useArenaStore((s) => s.activeBattle);
  const activeBattle = battleProp ?? storeActiveBattle;
  const competitorStates = useArenaStore((s) => s.competitorStates);
  const pendingWinnerId = useArenaStore((s) => s.pendingWinnerId);
  const pickWinner = useArenaStore((s) => s.pickWinner);
  const confirmWinner = useArenaStore((s) => s.confirmWinner);
  const resetToConfig = useArenaStore((s) => s.resetToConfig);

  if (!activeBattle) return null;

  const competitors = activeBattle.competitors;
  const isFinalized = !!activeBattle.winnerId;

  // Real ELO delta preview via IPC — uses actual ratings from the DB
  const [eloDeltas, setEloDeltas] = useState<Map<string, number>>(new Map());
  const lastPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    const winnerId = activeBattle?.winnerId ?? pendingWinnerId;
    if (!winnerId || !activeBattle) {
      setEloDeltas(new Map());
      lastPreviewRef.current = null;
      return;
    }
    // Avoid re-fetching for the same winner pick
    if (lastPreviewRef.current === winnerId) return;
    lastPreviewRef.current = winnerId;

    api.arena.previewElo(activeBattle.id, winnerId).then((results) => {
      const map = new Map<string, number>();
      for (const r of results) {
        map.set(r.competitorId, r.delta);
      }
      setEloDeltas(map);
    }).catch(() => {
      // Non-fatal — just won't show preview
      setEloDeltas(new Map());
    });
  }, [activeBattle, pendingWinnerId]);

  const getEloDelta = (competitorId: string): number | undefined => {
    const winnerId = activeBattle?.winnerId ?? pendingWinnerId;
    if (!winnerId) return undefined;
    return eloDeltas.get(competitorId);
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <Trophy size={18} className="text-yellow-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100">
            {isFinalized ? 'Battle Results' : 'Pick a Winner'}
          </h2>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{activeBattle.prompt}</p>
        </div>
        {!readOnly && !isFinalized && pendingWinnerId && (
          <button
            onClick={confirmWinner}
            className="px-3 py-1.5 text-xs font-medium rounded bg-yellow-500 text-zinc-900 hover:bg-yellow-400 transition-colors shrink-0"
          >
            Confirm Winner
          </button>
        )}
        {(readOnly || isFinalized) && (
          <button
            onClick={resetToConfig}
            className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0 flex items-center gap-1.5"
          >
            <X size={12} />
            Close
          </button>
        )}
      </div>

      {/* ELO delta preview */}
      {!isFinalized && pendingWinnerId && (
        <div className="shrink-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
          ELO preview:{' '}
          {competitors.map((c, i) => {
            const delta = getEloDelta(c.id);
            return (
              <span key={c.id}>
                {i > 0 && ' | '}
                <span className={cn('font-medium', delta && delta > 0 ? 'text-green-400' : 'text-red-400')}>
                  {c.modelId}: {delta !== undefined ? (delta > 0 ? `+${delta}` : String(delta)) : '—'}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Competitor previews grid */}
      <div
        className="grid gap-4 flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${Math.min(competitors.length, 2)}, 1fr)`,
        }}
      >
        {competitors.map((competitor) => {
          const state = competitorStates.get(competitor.id);
          return (
            <CompetitorPreview
              key={competitor.id}
              competitor={competitor}
              isWinner={activeBattle.winnerId === competitor.id}
              isPendingWinner={pendingWinnerId === competitor.id}
              previewUrl={state?.previewUrl}
              metrics={state?.metrics}
              eloDelta={getEloDelta(competitor.id)}
              onPickWinner={() => pickWinner(competitor.id)}
              readOnly={readOnly || isFinalized}
            />
          );
        })}
      </div>
    </div>
  );
}
