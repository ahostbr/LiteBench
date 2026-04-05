import type { ReactNode } from 'react';
import type { WorkspacePanel } from '@/stores/workspace-store';
import { PanelFrame } from './PanelFrame';

interface GridLayoutProps {
  panels: WorkspacePanel[];
  activePanelId: string | null;
  contentHosts: Map<string, HTMLDivElement>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  renderContent: (panel: WorkspacePanel) => ReactNode;
}

/**
 * Auto-size grid based on panel count (from LiteImage GridLayout.tsx).
 * Returns both column and row definitions for even distribution.
 */
function getGridStyle(count: number): { gridTemplateColumns: string; gridTemplateRows: string } {
  if (count <= 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (count === 2) return { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: '1fr' };
  if (count <= 4) return { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))' };
  if (count <= 6) return { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))' };
  return { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(0, 1fr))' };
}

export function GridLayout({
  panels,
  activePanelId,
  onActivate,
  onClose,
  onReorder,
  renderContent,
}: GridLayoutProps) {
  return (
    <div
      className="w-full h-full bg-zinc-800"
      style={{ display: 'grid', ...getGridStyle(panels.length), gap: 1 }}
    >
      {panels.map((panel, index) => (
        <PanelFrame
          key={panel.id}
          title={panel.title}
          active={panel.id === activePanelId}
          onActivate={() => onActivate(panel.id)}
          onClose={() => onClose(panel.id)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', String(index));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={(e) => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (!isNaN(from) && from !== index) onReorder(from, index);
          }}
        >
          {renderContent(panel)}
        </PanelFrame>
      ))}
    </div>
  );
}
