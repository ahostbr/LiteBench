import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Globe } from 'lucide-react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function BrowserPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('https://');
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync so rAF callback always has latest sessionId
  sessionIdRef.current = sessionId;

  const sendBounds = useCallback(() => {
    const el = containerRef.current;
    const sid = sessionIdRef.current;
    if (!el || !sid) return;
    const rect = el.getBoundingClientRect();
    api.browser.setBounds(sid, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, []);

  // Mount: create session
  useEffect(() => {
    let destroyed = false;
    let sid: string | null = null;

    api.browser.create().then((id) => {
      if (destroyed) {
        api.browser.destroy(id);
        return;
      }
      sid = id;
      setSessionId(id);
      api.browser.show(id);
    });

    return () => {
      destroyed = true;
      if (sid) {
        api.browser.hide(sid);
        api.browser.destroy(sid);
      }
    };
  }, []);

  // Show/hide WebContentsView when switching tabs — native views render above DOM
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);
  const panels = useWorkspaceStore((s) => s.panels);
  const isBrowserActive = panels.some((p) => p.type === 'browser' && p.id === activePanelId);

  useEffect(() => {
    if (!sessionId) return;
    if (isBrowserActive) {
      api.browser.show(sessionId);
      sendBounds();
    } else {
      api.browser.hide(sessionId);
    }
  }, [isBrowserActive, sessionId]);

  // Track bounds with ResizeObserver + rAF, and sync URL from WebContentsView
  useEffect(() => {
    if (!sessionId || !containerRef.current) return;

    let animating = true;
    let lastSyncedUrl = '';
    let urlPollCounter = 0;

    const tick = () => {
      if (!animating) return;
      sendBounds();

      // Sync URL bar every ~30 frames (~500ms at 60fps) — catches agent-driven navigation
      urlPollCounter++;
      if (urlPollCounter % 30 === 0) {
        api.browser.getUrl(sessionId).then((url: string) => {
          if (url && url !== lastSyncedUrl && url !== 'about:blank') {
            lastSyncedUrl = url;
            setUrlInput(url);
          }
        }).catch(() => {});
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(() => {
      sendBounds();
    });

    observer.observe(containerRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      animating = false;
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [sessionId, sendBounds]);

  const navigate = useCallback((url: string) => {
    if (!sessionId) return;
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setUrlInput(target);
    setIsLoading(true);
    api.browser.navigate(sessionId, target).finally(() => setIsLoading(false));
  }, [sessionId]);

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigate(urlInput);
    }
  };

  const handleBack = () => {
    if (sessionId) api.browser.back(sessionId);
  };

  const handleForward = () => {
    if (sessionId) api.browser.forward(sessionId);
  };

  const handleReload = () => {
    if (sessionId) {
      setIsLoading(true);
      api.browser.reload(sessionId).finally(() => setIsLoading(false));
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <button
          onClick={handleBack}
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Back"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={handleForward}
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Forward"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={handleReload}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors',
            isLoading && 'animate-spin text-zinc-300',
          )}
          title="Reload"
        >
          <RotateCw size={14} strokeWidth={1.5} />
        </button>

        <div className="flex-1 flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 mx-1">
          <Globe size={12} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            className="flex-1 bg-transparent text-zinc-200 text-xs outline-none placeholder:text-zinc-600 min-w-0"
            placeholder="Enter URL..."
            spellCheck={false}
          />
        </div>
      </div>

      {/* Native view placeholder — WebContentsView overlays this div's bounds */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative bg-zinc-950"
      >
        {!sessionId && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">
            Initializing browser...
          </div>
        )}
      </div>
    </div>
  );
}
