import { useState, useCallback } from 'react';
import { Play, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EndpointPicker } from './EndpointPicker';
import { ModelSelector } from './ModelSelector';
import { TestPicker } from './TestPicker';
import { LiveProgress } from './LiveProgress';
import { useBenchmarkStore } from '@/stores/benchmark';
import { useResultsStore } from '@/stores/results';
import { useSSE } from '@/hooks/useSSE';
import { api } from '@/api/client';
import type { SSETestDone, SSESummary, SSEStarted, SSETestStart } from '@/api/types';

export function RunBenchmark() {
  const [endpointId, setEndpointId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [suiteId, setSuiteId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const benchmark = useBenchmarkStore();
  const { fetch: refreshResults } = useResultsStore();

  const canRun = endpointId && modelId && suiteId && benchmark.status !== 'running';

  const handleSSEEvent = useCallback(
    (event: string, data: unknown) => {
      console.log('[LiteBench] SSE event:', event, data);
      switch (event) {
        case 'started': {
          const d = data as SSEStarted;
          benchmark.startRun(d.run_id, d.total_tests);
          break;
        }
        case 'test_start': {
          const d = data as SSETestStart;
          benchmark.setCurrentTest(d.name);
          break;
        }
        case 'test_done': {
          benchmark.addResult(data as SSETestDone);
          break;
        }
        case 'summary': {
          benchmark.setSummary(data as SSESummary);
          break;
        }
        case 'done':
        case 'cancelled': {
          benchmark.finish(event as 'done' | 'cancelled');
          refreshResults();
          break;
        }
        case 'error': {
          benchmark.finish('error');
          refreshResults();
          break;
        }
      }
    },
    [benchmark, refreshResults],
  );

  const { close: closeSSE } = useSSE(benchmark.sseUrl, handleSSEEvent);

  const handleStart = async () => {
    if (!canRun) return;
    console.log('[LiteBench] Starting benchmark:', { endpointId, modelId, suiteId, isThinking });
    setStarting(true);
    try {
      const modelName = modelId!.split('/').pop() ?? modelId!;
      const { run_id } = await api.benchmarks.run({
        endpoint_id: endpointId!,
        suite_id: suiteId!,
        model_id: modelId!,
        model_name: modelName,
        is_thinking: isThinking,
      });
      console.log('[LiteBench] Run created, run_id:', run_id, '— opening SSE stream');
      benchmark.startRun(run_id, 0); // SSE will update total_tests
    } catch (e) {
      console.error('[LiteBench] Failed to start benchmark:', e);
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (benchmark.runId) {
      await api.benchmarks.cancel(benchmark.runId);
      closeSSE();
      benchmark.finish('cancelled');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <EndpointPicker selected={endpointId} onSelect={setEndpointId} />
        <ModelSelector
          endpointId={endpointId}
          selectedModel={modelId}
          isThinking={isThinking}
          onSelect={setModelId}
          onToggleThinking={setIsThinking}
        />
        <TestPicker selectedSuiteId={suiteId} onSelect={setSuiteId} />
      </div>

      <div className="flex items-center gap-3">
        {benchmark.status === 'running' ? (
          <Button variant="danger" onClick={handleCancel}>
            <StopCircle size={16} /> Cancel
          </Button>
        ) : (
          <Button onClick={handleStart} disabled={!canRun || starting}>
            <Play size={16} /> {starting ? 'Starting...' : 'Run Benchmark'}
          </Button>
        )}
        {benchmark.status !== 'idle' && benchmark.status !== 'running' && (
          <Button variant="ghost" onClick={() => benchmark.reset()}>
            Clear
          </Button>
        )}
      </div>

      <LiveProgress />
    </div>
  );
}
