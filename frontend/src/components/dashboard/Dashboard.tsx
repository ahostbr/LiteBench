import { useEffect } from 'react';
import { Activity, Gauge, Timer, Hash } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { ScoreRadar, SpeedBar, ScoreTrend } from '@/components/charts';
import { RecentRuns } from './RecentRuns';
import { useResultsStore } from '@/stores/results';
import { formatScore, formatTps, formatTime } from '@/lib/format';
import type { BenchmarkRun } from '@/api/types';

interface DashboardProps {
  onSelectRun: (run: BenchmarkRun) => void;
}

export function Dashboard({ onSelectRun }: DashboardProps) {
  const { runs, loading, fetch } = useResultsStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const completed = runs.filter((r) => r.status === 'completed');
  const bestScore = completed.length
    ? completed.reduce((best, r) => ((r.avg_score ?? 0) > (best.avg_score ?? 0) ? r : best))
    : null;
  const fastestRun = completed.length
    ? completed.reduce((best, r) => ((r.avg_tps ?? 0) > (best.avg_tps ?? 0) ? r : best))
    : null;
  const totalTime = completed.reduce((sum, r) => sum + (r.total_time_s ?? 0), 0);

  // Get recent completed runs with results for charts (up to 5 unique models)
  const seenModels = new Set<string>();
  const chartRuns = completed.filter((r) => {
    if (seenModels.has(r.model_name) || r.results.length === 0) return false;
    seenModels.add(r.model_name);
    return true;
  }).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-900/30">
              <Hash size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{completed.length}</p>
              <p className="text-xs text-zinc-500">Total Runs</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-900/30">
              <Gauge size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{bestScore ? formatScore(bestScore.avg_score) : '-'}</p>
              <p className="text-xs text-zinc-500">Best Score {bestScore ? `(${bestScore.model_name})` : ''}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-900/30">
              <Activity size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{fastestRun ? formatTps(fastestRun.avg_tps) : '-'}</p>
              <p className="text-xs text-zinc-500">Fastest {fastestRun ? `(${fastestRun.model_name})` : ''}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-900/30">
              <Timer size={18} className="text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{formatTime(totalTime)}</p>
              <p className="text-xs text-zinc-500">Total Bench Time</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row */}
      {chartRuns.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Category Scores</CardTitle>
            </CardHeader>
            <ScoreRadar runs={chartRuns} />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Speed Comparison</CardTitle>
            </CardHeader>
            <SpeedBar runs={chartRuns} />
          </Card>
        </div>
      )}

      {/* Score Trend */}
      {completed.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Score Trend</CardTitle>
          </CardHeader>
          <ScoreTrend runs={completed} />
        </Card>
      )}

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-zinc-500 py-4">Loading...</p>
        ) : (
          <RecentRuns runs={runs} onSelect={onSelectRun} />
        )}
      </Card>
    </div>
  );
}
