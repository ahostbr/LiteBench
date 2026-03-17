import type { BenchmarkRun } from '@/api/types';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Badge, scoreBadge } from '@/components/ui/Badge';
import { formatScore, formatTps, formatTime, formatDate } from '@/lib/format';

interface RecentRunsProps {
  runs: BenchmarkRun[];
  onSelect: (run: BenchmarkRun) => void;
}

export function RecentRuns({ runs, onSelect }: RecentRunsProps) {
  const recent = runs.slice(0, 10);
  if (recent.length === 0) {
    return <p className="text-sm text-zinc-500 py-4">No benchmark runs yet.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Model</TH>
          <TH>Score</TH>
          <TH>Speed</TH>
          <TH>Time</TH>
          <TH>Status</TH>
          <TH>Date</TH>
        </TR>
      </THead>
      <TBody>
        {recent.map((run) => (
          <TR key={run.id} onClick={() => onSelect(run)}>
            <TD className="font-medium text-zinc-200">{run.model_name}</TD>
            <TD>
              <Badge variant={scoreBadge(run.avg_score ?? 0)}>{formatScore(run.avg_score)}</Badge>
            </TD>
            <TD>{formatTps(run.avg_tps)}</TD>
            <TD>{formatTime(run.total_time_s)}</TD>
            <TD>
              <Badge
                variant={
                  run.status === 'completed' ? 'success' : run.status === 'running' ? 'info' : 'error'
                }
              >
                {run.status}
              </Badge>
            </TD>
            <TD className="text-zinc-500">{formatDate(run.started_at)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
