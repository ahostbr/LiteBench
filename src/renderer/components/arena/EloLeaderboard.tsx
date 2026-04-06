import { useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import { useArenaStore } from '@/stores/arena-store';
import { cn } from '@/lib/utils';
import type { EloRating } from '../../../shared/types';

const RANK_STYLES: Record<number, { badge: string; row: string }> = {
  1: {
    badge: 'bg-yellow-500 text-zinc-900',
    row: 'bg-yellow-500/5 border-yellow-500/20',
  },
  2: {
    badge: 'bg-zinc-300 text-zinc-900',
    row: 'bg-zinc-400/5 border-zinc-500/20',
  },
  3: {
    badge: 'bg-amber-700 text-zinc-100',
    row: 'bg-amber-800/5 border-amber-700/20',
  },
};

function TrendIcon({ wins, losses }: { wins: number; losses: number }) {
  // Simplified trend: compare wins vs losses ratio
  if (wins + losses === 0) return <Minus size={13} className="text-zinc-600" />;
  const ratio = wins / (wins + losses);
  if (ratio > 0.55) return <TrendingUp size={13} className="text-green-400" />;
  if (ratio < 0.45) return <TrendingDown size={13} className="text-red-400" />;
  return <Minus size={13} className="text-zinc-500" />;
}

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];
  if (!style) {
    return (
      <span className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-500">
        {rank}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold',
        style.badge,
      )}
    >
      {rank === 1 ? <Trophy size={11} /> : rank}
    </span>
  );
}

function WinLossDisplay({ rating }: { rating: EloRating }) {
  const { wins, losses, draws } = rating;
  return (
    <span className="text-xs font-mono text-zinc-400">
      <span className="text-green-400">{wins}</span>
      <span className="text-zinc-600">W</span>{' '}
      <span className="text-red-400">{losses}</span>
      <span className="text-zinc-600">L</span>
      {draws > 0 && (
        <>
          {' '}
          <span className="text-zinc-500">{draws}</span>
          <span className="text-zinc-600">D</span>
        </>
      )}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <Trophy size={36} className="text-zinc-700" />
      <p className="text-sm font-medium text-zinc-500">No ratings yet</p>
      <p className="text-xs text-zinc-600 max-w-xs">
        ELO ratings appear here after models compete in battles.
      </p>
    </div>
  );
}

export function EloLeaderboard() {
  const eloLeaderboard = useArenaStore((s) => s.eloLeaderboard);
  const loadElo = useArenaStore((s) => s.loadElo);

  useEffect(() => {
    loadElo();
  }, []);

  const sorted = [...eloLeaderboard].sort((a, b) => b.rating - a.rating);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
        <Trophy size={15} className="text-yellow-400" />
        <h2 className="text-sm font-semibold text-zinc-100">ELO Leaderboard</h2>
        {sorted.length > 0 && (
          <span className="text-xs text-zinc-600 ml-1">({sorted.length} models)</span>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Table header */}
          <div className="grid grid-cols-[32px_1fr_80px_120px_60px_30px] gap-2 px-4 py-2 border-b border-zinc-800 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            <span>#</span>
            <span>Model</span>
            <span className="text-right">ELO</span>
            <span className="text-center">W / L / D</span>
            <span className="text-right">Battles</span>
            <span className="text-center">Trend</span>
          </div>

          {/* Table rows */}
          {sorted.map((rating, i) => {
            const rank = i + 1;
            const rankStyle = RANK_STYLES[rank];
            return (
              <div
                key={rating.modelKey}
                className={cn(
                  'grid grid-cols-[32px_1fr_80px_120px_60px_30px] gap-2 px-4 py-2.5 border-b items-center transition-colors',
                  rankStyle
                    ? cn('border', rankStyle.row)
                    : 'border-zinc-800/50 hover:bg-zinc-800/30',
                )}
              >
                {/* Rank */}
                <div className="flex items-center justify-center">
                  <RankBadge rank={rank} />
                </div>

                {/* Model name */}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{rating.modelKey}</p>
                </div>

                {/* ELO Rating */}
                <div className="text-right">
                  <span
                    className={cn(
                      'text-sm font-bold font-mono',
                      rank === 1
                        ? 'text-yellow-400'
                        : rank === 2
                        ? 'text-zinc-300'
                        : rank === 3
                        ? 'text-amber-600'
                        : 'text-zinc-300',
                    )}
                  >
                    {rating.rating}
                  </span>
                </div>

                {/* W/L/D */}
                <div className="flex items-center justify-center">
                  <WinLossDisplay rating={rating} />
                </div>

                {/* Battle count */}
                <div className="text-right">
                  <span className="text-xs text-zinc-500 font-mono">{rating.battleCount}</span>
                </div>

                {/* Trend */}
                <div className="flex items-center justify-center">
                  <TrendIcon wins={rating.wins} losses={rating.losses} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
