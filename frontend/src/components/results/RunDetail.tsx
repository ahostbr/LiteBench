import { useState, useEffect } from 'react';
import { ArrowLeft, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, scoreBadge } from '@/components/ui/Badge';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import {
  ScoreGauge,
  CategoryBar,
  TestScoreWaterfall,
  TokenBreakdown,
  SpeedScatter,
  TimingBar,
} from '@/components/charts';
import { formatScore, formatTps, formatTime, formatDate } from '@/lib/format';
import { useResultsStore } from '@/stores/results';
import { api } from '@/api/client';
import type { BenchmarkRun, TestResult } from '@/api/types';

interface RunDetailProps {
  runId: number;
  onBack: () => void;
}

export function RunDetail({ runId, onBack }: RunDetailProps) {
  const { getRun } = useResultsStore();
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    getRun(runId).then(setRun);
  }, [runId, getRun]);

  if (!run) return <p className="text-sm text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </Button>
        <h2 className="text-lg font-semibold">Run #{run.id}</h2>
      </div>

      {/* Summary card */}
      <Card>
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-xs text-zinc-500">Model</p>
            <p className="text-sm font-medium text-zinc-200 mt-1">{run.model_name}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Score</p>
            <p className="text-lg font-semibold text-zinc-100 mt-0.5">{formatScore(run.avg_score)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Speed</p>
            <p className="text-sm font-medium text-zinc-200 mt-1">{formatTps(run.avg_tps)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Time</p>
            <p className="text-sm font-medium text-zinc-200 mt-1">{formatTime(run.total_time_s)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Date</p>
            <p className="text-sm font-medium text-zinc-200 mt-1">{formatDate(run.started_at)}</p>
          </div>
        </div>
      </Card>

      {/* Export buttons */}
      <div className="flex gap-2">
        {['json', 'csv', 'md'].map((fmt) => (
          <a key={fmt} href={api.benchmarks.exportUrl(runId, fmt)} download>
            <Button variant="secondary" size="sm">
              <Download size={14} /> {fmt.toUpperCase()}
            </Button>
          </a>
        ))}
      </div>

      {/* Charts */}
      {run.results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>Overall Score</CardTitle></CardHeader>
              <ScoreGauge score={run.avg_score} />
            </Card>
            <div className="col-span-2">
              <Card>
                <CardHeader><CardTitle>Score by Category</CardTitle></CardHeader>
                <CategoryBar results={run.results} />
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle>Score per Test</CardTitle></CardHeader>
            <TestScoreWaterfall results={run.results} />
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Token Breakdown</CardTitle></CardHeader>
              <TokenBreakdown results={run.results} />
            </Card>
            <Card>
              <CardHeader><CardTitle>Speed vs Score</CardTitle></CardHeader>
              <SpeedScatter results={run.results} />
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Elapsed Time per Test</CardTitle></CardHeader>
            <TimingBar results={run.results} />
          </Card>
        </>
      )}

      {/* Results table */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results ({run.results.length})</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH className="w-8">#</TH>
              <TH>Test</TH>
              <TH>Category</TH>
              <TH>Score</TH>
              <TH>Speed</TH>
              <TH>Time</TH>
              <TH className="w-32">Bar</TH>
              <TH className="w-8"></TH>
            </TR>
          </THead>
          <TBody>
            {run.results.map((r, i) => (
              <>
                <TR key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <TD className="text-zinc-600">{i + 1}</TD>
                  <TD className="font-medium text-zinc-200">{r.name}</TD>
                  <TD>{r.category}</TD>
                  <TD>
                    <Badge variant={scoreBadge(r.final_score)}>{formatScore(r.final_score)}</Badge>
                  </TD>
                  <TD>{formatTps(r.tokens_per_sec)}</TD>
                  <TD>{formatTime(r.elapsed_s)}</TD>
                  <TD>
                    <ScoreBar score={r.final_score} showLabel={false} />
                  </TD>
                  <TD>
                    {expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </TD>
                </TR>
                {expanded === r.id && (
                  <tr key={`${r.id}-detail`}>
                    <td colSpan={8} className="px-4 py-3 bg-zinc-800/30">
                      <ResultDetail result={r} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function ResultDetail({ result }: { result: TestResult }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-4 gap-4">
        <div>
          <span className="text-zinc-500">Keywords:</span>{' '}
          <span className="text-emerald-400">{result.keyword_hits.length} hit</span>
          {result.keyword_misses.length > 0 && (
            <span className="text-red-400">, {result.keyword_misses.length} missed</span>
          )}
        </div>
        <div>
          <span className="text-zinc-500">Violations:</span>{' '}
          <span className={result.violations.length > 0 ? 'text-red-400' : 'text-zinc-400'}>
            {result.violations.length > 0 ? result.violations.join(', ') : 'None'}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">Tokens:</span>{' '}
          <span className="text-zinc-300">
            {result.prompt_tokens}+{result.completion_tokens}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">Finish:</span>{' '}
          <span className="text-zinc-300">{result.finish_reason}</span>
        </div>
      </div>
      {result.keyword_misses.length > 0 && (
        <div>
          <span className="text-zinc-500">Missed keywords:</span>{' '}
          <span className="text-amber-400">{result.keyword_misses.join(', ')}</span>
        </div>
      )}
      <div>
        <p className="text-zinc-500 mb-1">Response ({result.answer_length} chars):</p>
        <pre className="text-xs text-zinc-400 bg-zinc-900 rounded-lg p-3 max-h-60 overflow-auto whitespace-pre-wrap">
          {result.content.slice(0, 2000)}
          {result.content.length > 2000 && '...'}
        </pre>
      </div>
    </div>
  );
}
