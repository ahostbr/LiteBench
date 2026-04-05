import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Trophy, Zap } from 'lucide-react';
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
  const winnerCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    compare(runIds).then((r) => { setRuns(r); setLoading(false); });
  }, [runIds, compare]);

  const handleExportImage = async () => {
    const el = winnerCardRef.current;
    if (!el) return;
    try {
      // Use html2canvas-style approach via canvas API
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { backgroundColor: '#18181b', scale: 2 });
      const link = document.createElement('a');
      const names = runs.map((r) => r.model_name.replace(/[^a-zA-Z0-9]/g, '-')).join('_vs_');
      link.download = `litebench-${names}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Fallback: copy as text
      const text = runs.map((r) => `${r.model_name}: ${r.avg_score}`).join(' vs ');
      navigator.clipboard.writeText(text);
      alert('html2canvas not available — copied summary to clipboard');
    }
  };

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

      {/* Winner Card */}
      {(() => {
        const testIds = new Set<string>();
        for (const run of runs) for (const r of run.results) testIds.add(r.test_id);
        const winCounts = runs.map(() => 0);
        let ties = 0;
        for (const tid of testIds) {
          const scores = runs.map((run) => run.results.find((r) => r.test_id === tid)?.final_score ?? 0);
          const max = Math.max(...scores);
          const winners = scores.filter((s) => s === max);
          if (winners.length === 1) winCounts[scores.indexOf(max)]++;
          else ties++;
        }
        const bestIdx = winCounts.indexOf(Math.max(...winCounts));
        const winner = runs[bestIdx];
        const loser = runs[bestIdx === 0 ? 1 : 0];
        const faster = runs.reduce((a, b) => (a.avg_tps ?? 0) > (b.avg_tps ?? 0) ? a : b);

        return (
          <div ref={winnerCardRef} className="relative overflow-hidden rounded-xl border border-zinc-700/50 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-6">
            <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
              <Trophy size={128} />
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">LiteBench Head-to-Head</p>
                <h3 className="text-2xl font-bold text-zinc-100">
                  <span style={{ color: getModelColor(winner.model_name) }}>{winner.model_name}</span>
                  {' '}wins {winCounts[bestIdx]} of {testIds.size}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={handleExportImage}>
                <Download size={14} className="mr-1" /> Export PNG
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              {runs.map((run, i) => (
                <div key={run.id} className={`rounded-lg p-4 ${i === bestIdx ? 'bg-zinc-800 ring-1 ring-amber-500/30' : 'bg-zinc-800/50'}`}>
                  {i === bestIdx && <Trophy size={14} className="text-amber-500 mb-1" />}
                  <p className="text-sm font-semibold" style={{ color: getModelColor(run.model_name) }}>{run.model_name}</p>
                  <p className="text-2xl font-bold text-zinc-100 mt-1">{formatScore(run.avg_score)}</p>
                  <p className="text-xs text-zinc-500">score</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-zinc-400">
                    <Zap size={10} /> {formatTps(run.avg_tps)} &middot; {winCounts[i]}W / {ties}T
                  </div>
                </div>
              ))}
              <div className="rounded-lg bg-zinc-800/50 p-4 flex flex-col justify-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Fastest</p>
                <p className="text-sm font-semibold" style={{ color: getModelColor(faster.model_name) }}>{faster.model_name}</p>
                <p className="text-lg font-bold text-zinc-100">{formatTps(faster.avg_tps)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Win/Loss Pie */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Win / Loss / Tie</CardTitle></CardHeader>
          <WinLossPie runs={runs} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Score Difference per Test</CardTitle></CardHeader>
          <ScoreDelta runs={runs} />
        </Card>
      </div>

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
