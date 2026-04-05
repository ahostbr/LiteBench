import { useCallback, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import type { AgentBenchmarkStreamEvent } from '../../shared/types';

type Handler = (event: AgentBenchmarkStreamEvent) => void;

/**
 * Subscribes to bench:agent-bench:event IPC stream for a given runId.
 * Unsubscribes automatically when runId changes or becomes null.
 */
export function useAgentBenchStream(runId: number | null, onEvent: Handler) {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!runId) return;

    const unsubscribe = api.agentBenchmark.onEvent((payload) => {
      if (payload.run_id !== runId) return;
      handlerRef.current(payload);
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      if (unsubscribeRef.current === unsubscribe) {
        unsubscribeRef.current = null;
      }
    };
  }, [runId]);

  const close = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  return { close };
}
