import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorkspacePanel } from '@/stores/workspace-store';
import { PanelFrame } from './PanelFrame';

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface WindowLayoutProps {
  panels: WorkspacePanel[];
  activePanelId: string | null;
  contentHosts: Map<string, HTMLDivElement>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  renderContent: (panel: WorkspacePanel) => ReactNode;
}

type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center';

export function WindowLayout({
  panels,
  activePanelId,
  onActivate,
  onClose,
  renderContent,
}: WindowLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowStates, setWindowStates] = useState<Record<string, WindowState>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();

    setWindowStates((current) => {
      const next: Record<string, WindowState> = {};
      panels.forEach((panel, index) => {
        next[panel.id] = current[panel.id] ?? {
          x: 32 + index * 28,
          y: 32 + index * 28,
          width: Math.min(560, bounds.width * 0.55),
          height: Math.min(360, bounds.height * 0.55),
          zIndex: index + 1,
        };
      });
      return next;
    });
  }, [panels]);

  function bringToFront(panelId: string) {
    setWindowStates((current) => {
      const topZ = Math.max(0, ...Object.values(current).map((s) => s.zIndex));
      return { ...current, [panelId]: { ...current[panelId], zIndex: topZ + 1 } };
    });
  }

  function resolveDropZone(clientX: number, clientY: number): DropZone | null {
    const container = containerRef.current;
    if (!container) return null;
    const bounds = container.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    const edge = 0.12;
    if (y < edge) return 'top';
    if (y > 1 - edge) return 'bottom';
    if (x < edge) return 'left';
    if (x > 1 - edge) return 'right';
    if (x > 0.35 && x < 0.65 && y > 0.35 && y < 0.65) return 'center';
    return null;
  }

  function applyDropZone(panelId: string, zone: DropZone) {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const snaps: Record<DropZone, Partial<WindowState>> = {
      top: { x: 0, y: 0, width: bounds.width, height: bounds.height / 2 },
      bottom: { x: 0, y: bounds.height / 2, width: bounds.width, height: bounds.height / 2 },
      left: { x: 0, y: 0, width: bounds.width / 2, height: bounds.height },
      right: { x: bounds.width / 2, y: 0, width: bounds.width / 2, height: bounds.height },
      center: { x: 0, y: 0, width: bounds.width, height: bounds.height },
    };
    setWindowStates((current) => ({
      ...current,
      [panelId]: { ...current[panelId], ...snaps[zone] },
    }));
  }

  const zoneInsets: Record<DropZone, string> = {
    top: '0 0 88% 0',
    bottom: '88% 0 0 0',
    left: '0 88% 0 0',
    right: '0 0 0 88%',
    center: '35% 35%',
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-zinc-950">
      {draggingId && dropZone && (
        <div
          className="absolute pointer-events-none z-[999] border-2 border-dashed border-[var(--accent-color)] bg-[var(--accent-color)]/10"
          style={{ inset: zoneInsets[dropZone] }}
        />
      )}
      {panels.map((panel) => {
        const state = windowStates[panel.id];
        if (!state) return null;

        return (
          <div
            key={panel.id}
            className="absolute"
            style={{
              left: state.x,
              top: state.y,
              width: state.width,
              height: state.height,
              zIndex: state.zIndex,
              minWidth: 240,
              minHeight: 180,
            }}
            onMouseDown={() => {
              bringToFront(panel.id);
              onActivate(panel.id);
            }}
          >
            {/* Drag header area */}
            <div
              className="w-full h-full"
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = state.x;
                const startTop = state.y;
                setDraggingId(panel.id);

                const onMouseMove = (me: MouseEvent) => {
                  setWindowStates((cur) => ({
                    ...cur,
                    [panel.id]: {
                      ...cur[panel.id],
                      x: startLeft + (me.clientX - startX),
                      y: startTop + (me.clientY - startY),
                    },
                  }));
                  setDropZone(resolveDropZone(me.clientX, me.clientY));
                };

                const onMouseUp = (ue: MouseEvent) => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                  const finalZone = resolveDropZone(ue.clientX, ue.clientY);
                  if (finalZone) applyDropZone(panel.id, finalZone);
                  setDraggingId(null);
                  setDropZone(null);
                };

                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            >
              <PanelFrame
                title={panel.title}
                active={panel.id === activePanelId}
                onActivate={() => { bringToFront(panel.id); onActivate(panel.id); }}
                onClose={() => onClose(panel.id)}
              >
                {renderContent(panel)}
              </PanelFrame>
            </div>
            {/* Resize handle */}
            <div
              className="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = state.width;
                const startH = state.height;

                const onMouseMove = (me: MouseEvent) => {
                  setWindowStates((cur) => ({
                    ...cur,
                    [panel.id]: {
                      ...cur[panel.id],
                      width: Math.max(240, startW + (me.clientX - startX)),
                      height: Math.max(180, startH + (me.clientY - startY)),
                    },
                  }));
                };

                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                };

                document.body.style.cursor = 'nwse-resize';
                document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
