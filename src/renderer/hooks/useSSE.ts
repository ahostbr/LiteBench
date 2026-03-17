import { useEffect, useRef, useCallback } from 'react';

type SSEHandler = (event: string, data: unknown) => void;

export function useSSE(url: string | null, onEvent: SSEHandler) {
  const sourceRef = useRef<EventSource | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!url) return;

    console.log('[useSSE] Opening EventSource:', url);
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      console.log('[useSSE] Connection opened:', url, 'readyState:', source.readyState);
    };

    const events = ['started', 'test_start', 'test_done', 'summary', 'done', 'error', 'cancelled'];
    for (const evt of events) {
      source.addEventListener(evt, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handlerRef.current(evt, data);
        } catch {
          handlerRef.current(evt, e.data);
        }
      });
    }

    source.onerror = () => {
      console.error('[useSSE] Connection error:', url, 'readyState:', source.readyState);
      source.close();
      handlerRef.current('error', { message: 'SSE connection lost' });
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [url]);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  return { close };
}
