import { useState, useCallback, useEffect } from 'react';
import {
  Microscope,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  BarChart3,
  Play,
  StopCircle,
} from 'lucide-react';
import { useAgentBenchmarkStore } from '@/stores/agent-benchmark-store';
import { useTestsStore } from '@/stores/tests';
import { useEndpointsStore } from '@/stores/endpoints';
import { useAgentBenchStream } from '@/hooks/useAgentBenchStream';
import { AgentTestProgress } from './AgentTestProgress';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import { api } from '@/api/client';
import type {
  AgentBenchmarkStreamEvent,
  AgentBenchmarkStarted,
  AgentBenchmarkTaskStart,
  AgentBenchmarkTextDelta,
  AgentBenchmarkToolCall,
  AgentBenchmarkToolDone,
  AgentBenchmarkTaskDone,
  AgentBenchmarkSummary,
  CompletedAgentTask,
} from '../../../shared/types';

// --- Helpers ---

function scoreColor(score: number): string {
  if (score >= 0.8) return 'text-green-400';
  if (score >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 0.8) return 'bg-green-500/10 border-green-500/20';
  if (score >= 0.5) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

// --- Sub-components ---

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { cls: string; icon: React.ElementType; spin?: boolean }> = {
    running: { icon: Loader2, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', spin: true },
    done: { icon: CheckCircle2, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
    error: { icon: XCircle, cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
    cancelled: { icon: XCircle, cls: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
  };
  const { icon: Icon, cls, spin } = configs[status] ?? configs.running;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium', cls)}>
      <Icon className={cn('w-3 h-3', spin && 'animate-spin')} />
      {status}
    </span>
  );
}

function CompletedTaskRow({ result, index }: { result: CompletedAgentTask; index: number }) {
  return (
    <div className={cn('rounded-lg border px-4 py-3', scoreBg(result.score))}>
      <div className="flex items-start gap-3">
        <span className="text-xs text-zinc-600 w-5 text-right mt-0.5 shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-200 truncate">{result.name}</span>
            <span className={cn('text-xs font-mono font-medium', scoreColor(result.score))}>
              {(result.score * 100).toFixed(0)}%
            </span>
            {result.error && (
              <span className="text-xs text-red-400 truncate max-w-[200px]" title={result.error}>
                {result.error}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-zinc-500">{result.category}</span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="w-3 h-3" />
              {formatTime(result.elapsed_s)}
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Wrench className="w-3 h-3" />
              {result.tool_calls_made} calls
            </span>
          </div>
          {result.tools_used.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {result.tools_used.map((tool) => (
                <span
                  key={tool}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="w-20 shrink-0">
          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                result.score >= 0.8 ? 'bg-green-500' : result.score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500',
              )}
              style={{ width: `${result.score * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;
  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-zinc-500" />
        <span className="text-sm font-medium text-zinc-300">Tool Usage Distribution</span>
      </div>
      <div className="space-y-2">
        {entries.map(([tool, count]) => (
          <div key={tool} className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-400 w-40 truncate shrink-0">{tool}</span>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500 w-6 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Run controls ---

function RunControls() {
  const store = useAgentBenchmarkStore();
  const { suites, loading: suitesLoading, fetch: fetchSuites } = useTestsStore();
  const { endpoints, fetch: fetchEndpoints, models, discoverModels } = useEndpointsStore();

  const [endpointId, setEndpointId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [suiteId, setSuiteId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchSuites();
    fetchEndpoints();
  }, [fetchSuites, fetchEndpoints]);

  useEffect(() => {
    if (endpointId) {
      const existing = models.get(endpointId);
      if (!existing || existing.length === 0) {
        discoverModels(endpointId);
      }
    }
  }, [endpointId, models, discoverModels]);

  // Filter to suites that contain at least one agent task
  const agentSuites = suites.filter((s) => s.cases.some((c) => c.is_agent_task));
  const modelList = endpointId ? models.get(endpointId) ?? [] : [];
  const canRun = endpointId && modelId && suiteId && store.status !== 'running';

  const handleStart = async () => {
    if (!canRun) return;
    setStarting(true);
    try {
      const selectedSuite = agentSuites.find((s) => s.id === suiteId);
      const modelName = modelId!.split('/').pop() ?? modelId!;
      const { run_id } = await api.agentBenchmark.run({
        endpoint_id: endpointId!,
        suite_id: suiteId!,
        model_id: modelId!,
        model_name: modelName,
      });
      store.startRun(run_id, selectedSuite?.name ?? 'Agent Suite', modelName, 0);
    } catch (e) {
      console.error('[AgentBench] Failed to start:', e);
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (store.runId) {
      try {
        await api.agentBenchmark.cancel(store.runId);
      } catch {
        // ignore cancel errors
      }
      store.finish('cancelled');
    }
  };

  return (
    <div className="border-b border-zinc-800 px-4 py-3 space-y-3 shrink-0 bg-zinc-900/30">
      <div className="grid grid-cols-3 gap-2">
        {/* Endpoint */}
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Endpoint</label>
          <select
            value={endpointId ?? ''}
            onChange={(e) => setEndpointId(Number(e.target.value) || null)}
            disabled={store.status === 'running'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">Select endpoint</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>{ep.name}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Model</label>
          <select
            value={modelId ?? ''}
            onChange={(e) => setModelId(e.target.value || null)}
            disabled={!endpointId || modelList.length === 0 || store.status === 'running'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">{modelList.length === 0 ? 'No models' : 'Select model'}</option>
            {modelList.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
        </div>

        {/* Agent suite (filtered) */}
        <div className="space-y-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Agent Suite</label>
          <select
            value={suiteId ?? ''}
            onChange={(e) => setSuiteId(Number(e.target.value) || null)}
            disabled={suitesLoading || agentSuites.length === 0 || store.status === 'running'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">
              {suitesLoading ? 'Loading...' : agentSuites.length === 0 ? 'No agent suites' : 'Select suite'}
            </option>
            {agentSuites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.cases.filter((c) => c.is_agent_task).length} tasks)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {store.status === 'running' ? (
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/40 text-red-400 text-xs font-medium hover:bg-red-600/30 transition-colors"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Cancel
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!canRun || starting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-400 text-xs font-medium hover:bg-blue-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {starting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {starting ? 'Starting...' : 'Run Agent Benchmark'}
          </button>
        )}
        {(store.status === 'done' || store.status === 'error' || store.status === 'cancelled') && (
          <button
            onClick={store.reset}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// --- Main panel ---

export function AgentBenchmarkPanel() {
  const store = useAgentBenchmarkStore();

  const handleEvent = useCallback(
    (event: AgentBenchmarkStreamEvent) => {
      switch (event.event) {
        case 'started': {
          const d = event.data as AgentBenchmarkStarted;
          store.startRun(d.run_id, d.suite_name, d.model_name, d.total_tasks);
          break;
        }
        case 'task_start': {
          const d = event.data as AgentBenchmarkTaskStart;
          store.setCurrentTask({
            task_id: d.task_id,
            name: d.name,
            prompt: d.prompt,
            category: d.category,
          });
          break;
        }
        case 'text_delta': {
          const d = event.data as AgentBenchmarkTextDelta;
          store.appendTextDelta(d.content);
          break;
        }
        case 'tool_call_start': {
          const d = event.data as AgentBenchmarkToolCall;
          store.addToolCall(d.tool_call);
          break;
        }
        case 'tool_call_done': {
          const d = event.data as AgentBenchmarkToolDone;
          store.updateToolCall(d.tool_call_id, {
            status: d.error ? 'error' : 'success',
            result: d.result,
            error: d.error,
            endTime: Date.now(),
          });
          break;
        }
        case 'task_done': {
          const d = event.data as AgentBenchmarkTaskDone;
          store.addResult({
            task_id: d.task_id,
            name: d.name,
            category: d.category,
            score: d.score,
            tool_calls_made: d.tool_calls_made,
            tools_used: d.tools_used,
            elapsed_s: d.elapsed_s,
            error: d.error,
          });
          break;
        }
        case 'summary': {
          const d = event.data as AgentBenchmarkSummary;
          store.setSummary(d);
          break;
        }
        case 'done':
          store.finish('done');
          break;
        case 'error':
          store.finish('error');
          break;
        case 'cancelled':
          store.finish('cancelled');
          break;
      }
    },
    [store],
  );

  const { close } = useAgentBenchStream(
    store.status === 'running' ? store.runId : null,
    handleEvent,
  );

  useEffect(() => () => close(), [close]);

  const { status, suiteName, modelName, totalTasks, completedTasks, currentTask, results, summary } = store;
  const isIdle = status === 'idle';
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <Microscope className="w-4 h-4 text-[var(--accent-color)]" strokeWidth={1.5} />
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">
          {suiteName ? `Agent Benchmark — ${suiteName}` : 'Agent Benchmark'}
        </span>
        {modelName && (
          <span className="text-xs text-zinc-500 font-mono shrink-0">{modelName}</span>
        )}
        {!isIdle && <StatusBadge status={status} />}
      </div>

      {/* Run controls — always visible */}
      <RunControls />

      {/* Results area */}
      {isIdle ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
          <Microscope className="w-8 h-8 text-zinc-700 mb-3" strokeWidth={1.5} />
          <p className="text-zinc-500 text-sm">Configure a run above to get started</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Progress</span>
              <span>{completedTasks}/{totalTasks} ({pct}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Current task — live streaming view */}
          {currentTask && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Running</p>
              <AgentTestProgress task={currentTask} />
            </div>
          )}

          {/* Completed tasks */}
          {results.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                Completed ({results.length})
              </p>
              <div className="space-y-2">
                {results.map((r, i) => (
                  <CompletedTaskRow key={r.task_id} result={r} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Summary on completion */}
          {summary && (
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Summary</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-700 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-zinc-100">
                    {(summary.avg_score * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Avg Score</p>
                </div>
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-700 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-zinc-100">{summary.total_tool_calls}</p>
                  <p className="text-xs text-zinc-500 mt-1">Tool Calls</p>
                </div>
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-700 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-zinc-100">
                    {formatTime(summary.total_time_s)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Total Time</p>
                </div>
              </div>
              {summary.tool_distribution && Object.keys(summary.tool_distribution).length > 0 && (
                <ToolDistributionChart distribution={summary.tool_distribution} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentBenchmarkPanel;
