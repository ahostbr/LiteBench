import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WorkspacePanel } from '@/stores/workspace-store';
import { PanelFrame } from './PanelFrame';

interface SplitterLayoutProps {
  panels: WorkspacePanel[];
  activePanelId: string | null;
  contentHosts: Map<string, HTMLDivElement>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  renderContent: (panel: WorkspacePanel) => ReactNode;
}

export function SplitterLayout({
  panels,
  activePanelId,
  onActivate,
  onClose,
  renderContent,
}: SplitterLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<number[]>([]);

  useEffect(() => {
    setSizes((current) => {
      if (current.length === panels.length) return current;
      const equal = panels.length > 0 ? 100 / panels.length : 100;
      return panels.map(() => equal);
    });
  }, [panels.length]);

  const resolvedSizes = useMemo(() => {
    if (sizes.length === panels.length) return sizes;
    const equal = panels.length > 0 ? 100 / panels.length : 100;
    return panels.map(() => equal);
  }, [panels.length, sizes]);

  return (
    <div ref={containerRef} className="flex w-full h-full bg-zinc-950">
      {panels.map((panel, index) => (
        <Fragment key={panel.id}>
          {index > 0 && (
            <div
              className="w-[3px] shrink-0 cursor-col-resize bg-zinc-800 hover:bg-[var(--accent-color)]/50 transition-colors"
              onMouseDown={(e) => {
                const container = containerRef.current;
                if (!container) return;
                e.preventDefault();
                const startX = e.clientX;
                const startSizes = [...resolvedSizes];
                const containerWidth = container.getBoundingClientRect().width;

                const onMouseMove = (me: MouseEvent) => {
                  const deltaPercent = ((me.clientX - startX) / containerWidth) * 100;
                  const next = [...startSizes];
                  const left = startSizes[index - 1] + deltaPercent;
                  const right = startSizes[index] - deltaPercent;
                  if (left < 10 || right < 10) return;
                  next[index - 1] = left;
                  next[index] = right;
                  setSizes(next);
                };

                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                };

                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            />
          )}
          <div style={{ width: `${resolvedSizes[index]}%` }} className="min-w-0 min-h-0">
            <PanelFrame
              title={panel.title}
              active={panel.id === activePanelId}
              onActivate={() => onActivate(panel.id)}
              onClose={() => onClose(panel.id)}
            >
              {renderContent(panel)}
            </PanelFrame>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
