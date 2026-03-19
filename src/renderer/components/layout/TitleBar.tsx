import { useEffect, useState } from 'react';
import {
  Copy, Minus, Square, X, Monitor,
  LayoutGrid, GripVertical, PanelTop, AppWindow,
} from 'lucide-react';
import iconSrc from '@/assets/icon.png';
import { cn } from '@/lib/utils';
import { useLayoutStore, type LayoutMode } from '@/stores/layout-store';

const LAYOUT_OPTIONS: { mode: LayoutMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'grid', icon: <LayoutGrid size={14} />, label: 'Grid' },
  { mode: 'splitter', icon: <GripVertical size={14} />, label: 'Splitter' },
  { mode: 'tabs', icon: <PanelTop size={14} />, label: 'Tabs' },
  { mode: 'window', icon: <AppWindow size={14} />, label: 'Window' },
];

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [isSpanned, setIsSpanned] = useState(false);
  const [displayCount, setDisplayCount] = useState(1);
  const layoutMode = useLayoutStore((s) => s.layoutMode);
  const setLayoutMode = useLayoutStore((s) => s.setLayoutMode);

  useEffect(() => {
    let mounted = true;

    void window.liteBench.window.isMaximized().then((v) => { if (mounted) setMaximized(v); });
    void window.liteBench.window.isSpanned().then((v) => { if (mounted) setIsSpanned(v); });
    void window.liteBench.window.displayCount().then((v) => { if (mounted) setDisplayCount(v); });

    const unsub1 = window.liteBench.window.onMaximizeChange((v) => setMaximized(v));
    const unsub2 = window.liteBench.window.onSpanChange((v) => setIsSpanned(v));

    return () => {
      mounted = false;
      unsub1();
      unsub2();
    };
  }, []);

  return (
    <div className="drag-region relative flex items-center h-9 bg-zinc-950/95 border-b border-zinc-800 select-none shrink-0">
      {/* Left: Branding */}
      <div className="no-drag flex items-center gap-2 px-3 h-full shrink-0">
        <img src={iconSrc} alt="LiteBench" className="h-4 w-4 rounded" draggable={false} />
        <span className="text-[11px] font-medium text-zinc-300">LiteBench</span>
        <span className="text-[10px] text-zinc-600">Desktop</span>
      </div>

      {/* Center: Layout controls */}
      <div className="flex-1 min-w-0" />
      <div className="no-drag absolute left-1/2 top-0 -translate-x-1/2 flex items-center gap-1 h-9">
        <div className="flex items-center gap-px bg-zinc-900 rounded p-px">
          {LAYOUT_OPTIONS.map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setLayoutMode(mode)}
              className={cn(
                'flex items-center justify-center w-[26px] h-[22px] rounded-sm transition-colors',
                layoutMode === mode
                  ? 'text-[var(--accent-color)] bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
              )}
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0" />

      {/* Right: Span + Window controls */}
      <div className="no-drag flex items-center h-full shrink-0">
        {displayCount > 1 && (
          <>
            <button
              onClick={() => isSpanned ? window.liteBench.window.restoreSpan() : window.liteBench.window.spanAllMonitors()}
              title={isSpanned ? 'Restore from multi-monitor span' : 'Span across all monitors'}
              className={cn(
                'flex items-center justify-center w-11 h-full transition-colors',
                isSpanned ? 'text-[var(--accent-color)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
              )}
            >
              <Monitor size={14} />
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-0.5 shrink-0" />
          </>
        )}

        <button
          onClick={() => window.liteBench.window.minimize()}
          className="flex items-center justify-center w-11 h-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.liteBench.window.maximize()}
          className="flex items-center justify-center w-11 h-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy size={13} className="rotate-180" /> : <Square size={13} />}
        </button>
        <button
          onClick={() => window.liteBench.window.close()}
          className="flex items-center justify-center w-11 h-full text-zinc-500 hover:bg-red-600/80 hover:text-zinc-100 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
