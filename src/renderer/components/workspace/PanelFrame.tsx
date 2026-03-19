import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelFrameProps {
  title: string;
  active: boolean;
  onActivate?: () => void;
  onClose?: () => void;
  draggable?: boolean;
  onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
  children: ReactNode;
}

export function PanelFrame({
  title,
  active,
  onActivate,
  onClose,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  children,
}: PanelFrameProps) {
  return (
    <section className="flex flex-col min-w-0 min-h-0 h-full bg-zinc-950 border border-zinc-800">
      <header
        onClick={onActivate}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'h-9 flex items-center justify-between px-2.5 border-b border-zinc-800 bg-zinc-900/80 cursor-default shrink-0',
          active ? 'border-t-2 border-t-[var(--accent-color)]' : 'border-t-2 border-t-transparent',
        )}
      >
        <span className={cn('text-xs', active ? 'text-zinc-200' : 'text-zinc-500')}>
          {title}
        </span>
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </section>
  );
}
