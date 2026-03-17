import { useEffect, useState } from 'react';
import { Copy, Minus, X, Zap } from 'lucide-react';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    void window.liteBench.window.isMaximized().then((value) => {
      if (mounted) {
        setMaximized(value);
      }
    });

    const unsubscribe = window.liteBench.window.onMaximizeChange((value) => {
      setMaximized(value);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-3 select-none">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-blue-400">
          <Zap size={14} />
        </div>
        <span className="font-medium tracking-tight text-zinc-300">LiteBench</span>
        <span className="text-xs text-zinc-600">Desktop</span>
      </div>

      <div className="no-drag flex items-center">
        <button
          onClick={() => window.liteBench.window.minimize()}
          className="flex h-11 w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.liteBench.window.maximize()}
          className="flex h-11 w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          <Copy size={13} className={maximized ? 'rotate-180' : ''} />
        </button>
        <button
          onClick={() => window.liteBench.window.close()}
          className="flex h-11 w-11 items-center justify-center text-zinc-500 transition-colors hover:bg-red-600/80 hover:text-zinc-100"
          aria-label="Close"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
