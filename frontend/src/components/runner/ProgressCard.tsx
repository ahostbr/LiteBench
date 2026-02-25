import { Badge, scoreBadge } from '@/components/ui/Badge';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { formatTps, formatTime } from '@/lib/format';
import type { SSETestDone } from '@/api/types';

interface ProgressCardProps {
  result: SSETestDone;
  index: number;
}

export function ProgressCard({ result, index }: ProgressCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-zinc-800/40 px-4 py-3">
      <span className="text-xs text-zinc-600 w-5 text-right">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">{result.name}</span>
          <Badge variant={scoreBadge(result.final_score)}>{result.final_score.toFixed(2)}</Badge>
          {result.had_thinking && <Badge variant="info">thinking</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
          <span>{result.category}</span>
          <span>{formatTps(result.tokens_per_sec)}</span>
          <span>{formatTime(result.elapsed_s)}</span>
          {result.error && <span className="text-red-400">{result.error}</span>}
        </div>
      </div>
      <ScoreBar score={result.final_score} className="w-28" showLabel={false} />
    </div>
  );
}
