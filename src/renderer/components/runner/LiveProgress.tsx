import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressCard } from './ProgressCard';
import { useBenchmarkStore } from '@/stores/benchmark';
import { formatScore, formatTps, formatTime } from '@/lib/format';

export function LiveProgress() {
  const { status, totalTests, completedTests, currentTest, results, summary } = useBenchmarkStore();

  if (status === 'idle') return null;

  const pct = totalTests > 0 ? Math.round((completedTests / totalTests) * 100) : 0;

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Live Progress</CardTitle>
            {status === 'running' && <Loader2 size={16} className="text-blue-400 animate-spin" />}
            <Badge variant={status === 'done' ? 'success' : status === 'error' ? 'error' : 'info'}>
              {status}
            </Badge>
          </div>
          <span className="text-sm text-zinc-400">
            {completedTests}/{totalTests} ({pct}%)
          </span>
        </div>
      </CardHeader>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {currentTest && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <Loader2 size={12} className="text-blue-400 animate-spin" />
          <span className="text-sm text-zinc-400">Running: {currentTest}</span>
        </div>
      )}

      {/* Results list */}
      <div className="space-y-1.5">
        {results.map((r, i) => (
          <ProgressCard key={r.test_id} result={r} index={i} />
        ))}
      </div>

      {/* Summary */}
      {summary && (
        <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-6 text-sm">
          <div>
            <span className="text-zinc-500">Avg Score:</span>{' '}
            <span className="text-zinc-200 font-medium">{formatScore(summary.avg_score)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Avg Speed:</span>{' '}
            <span className="text-zinc-200 font-medium">{formatTps(summary.avg_tps)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Total Time:</span>{' '}
            <span className="text-zinc-200 font-medium">{formatTime(summary.total_time_s)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
