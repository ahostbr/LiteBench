import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, scoreBadge } from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import {
  ScoreRadar,
  SpeedBar,
  WinLossPie,
  ScoreDelta,
  CategoryHeatmap,
  SpeedScatter,
} from '@/components/charts';
import { formatScore, formatTps, formatTime } from '@/lib/format';
import { useResultsStore } from '@/stores/results';
import { getModelColor } from '@/lib/colors';
import type { BenchmarkRun } from '@/api/types';

interface ComparisonViewProps {
  runIds: number[];
  onBack: () => void;
}

export function ComparisonView({ runIds, onBack }: ComparisonViewProps) {
  const { compare } = useResultsStore();
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    compare(runIds).then((r) => { setRuns(r); setLoading(false); });
  }, [runIds, compare]);

  if (loading) return <p className="text-sm text-zinc-500">Loading comparison...</p>;
  if (runs.length < 2) return <p className="text-sm text-zinc-500">Need at least 2 runs to compare.</p>;

  // Build comparison table by test_id
  const testIds = new Set<string>();
  for (const run of runs) {
    for (const r of run.results) testIds.add(r.test_id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </Button>
        <h2 className="text-lg font-semibold">Comparison</h2>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Category Scores</CardTitle></CardHeader>
          <ScoreRadar runs={runs} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Speed</CardTitle></CardHeader>
          <SpeedBar runs={runs} />
        </Card>
      </div>

      {/* Win/Loss + Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Win / Loss / Tie</CardTitle></CardHeader>
          <WinLossPie runs={runs} />
        </Card>
        <div className="col-span-2">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <div className="flex gap-6 justify-center py-4">
              {runs.map((run) => (
                <div key={run.id} className="text-center">
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-1"
                    style={{ backgroundColor: getModelColor(run.model_name) }}
                  />
                  <p className="text-sm font-medium text-zinc-200">{run.model_name}</p>
                  <p className="text-xs text-zinc-500">
                    Score: {formatScore(run.avg_score)} | {formatTps(run.avg_tps)} | {formatTime(run.total_time_s)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Score Delta */}
      <Card>
        <CardHeader><CardTitle>Score Difference per Test</CardTitle></CardHeader>
        <ScoreDelta runs={runs} />
      </Card>

      {/* Category Heatmap */}
      <Card>
        <CardHeader><CardTitle>Category Heatmap</CardTitle></CardHeader>
        <CategoryHeatmap runs={runs} />
      </Card>

      {/* Speed vs Score multi-run */}
      <Card>
        <CardHeader><CardTitle>Speed vs Score</CardTitle></CardHeader>
        <SpeedScatter runs={runs} />
      </Card>

      {/* Head-to-head table */}
      <Card>
        <CardHeader><CardTitle>Head-to-Head</CardTitle></CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Test</TH>
              {runs.map((run) => (
                <TH key={run.id} className="text-center">
                  <span style={{ color: getModelColor(run.model_name) }}>{run.model_name}</span>
                </TH>
              ))}
              <TH className="text-center">Winner</TH>
            </TR>
          </THead>
          <TBody>
            {Array.from(testIds).map((tid) => {
              const results = runs.map((run) => run.results.find((r) => r.test_id === tid));
              const scores = results.map((r) => r?.final_score ?? 0);
              const maxScore = Math.max(...scores);
              const winnerIdx = scores.filter((s) => s === maxScore).length === 1
                ? scores.indexOf(maxScore)
                : -1;
              const testName = results.find((r) => r)?.name ?? tid;

              return (
                <TR key={tid}>
                  <TD className="text-zinc-200">{testName}</TD>
                  {results.map((r, i) => (
                    <TD key={i} className="text-center">
                      {r ? (
                        <div>
                          <Badge variant={scoreBadge(r.final_score)}>{formatScore(r.final_score)}</Badge>
                          <span className="text-xs text-zinc-500 ml-1">{formatTps(r.tokens_per_sec)}</span>
                        </div>
                      ) : '-'}
                    </TD>
                  ))}
                  <TD className="text-center text-xs">
                    {winnerIdx >= 0 ? (
                      <span style={{ color: getModelColor(runs[winnerIdx].model_name) }}>
                        {runs[winnerIdx].model_name}
                      </span>
                    ) : 'TIE'}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
