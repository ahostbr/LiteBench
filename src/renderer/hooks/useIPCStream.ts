import { useCallback, useEffect, useRef } from 'react';
import type { BenchmarkStreamEventData, BenchmarkStreamEventName } from '@/api/types';

type IPCStreamHandler = (
  event: BenchmarkStreamEventName,
  data: BenchmarkStreamEventData,
) => void;

export function useIPCStream(runId: number | null, onEvent: IPCStreamHandler) {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!runId) {
      return;
    }

    const unsubscribe = window.liteBench.stream.onRunEvent((payload) => {
      if (payload.run_id !== runId) {
        return;
      }
      handlerRef.current(payload.event, payload.data as BenchmarkStreamEventData);
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
