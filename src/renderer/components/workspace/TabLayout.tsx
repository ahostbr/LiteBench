import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspacePanel } from '@/stores/workspace-store';

interface TabLayoutProps {
  panels: WorkspacePanel[];
  activePanelId: string | null;
  contentHosts: Map<string, HTMLDivElement>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  renderContent: (panel: WorkspacePanel) => ReactNode;
}

export function TabLayout({
  panels,
  activePanelId,
  onActivate,
  onClose,
  onReorder,
  renderContent,
}: TabLayoutProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-stretch h-9 border-b border-zinc-800 bg-zinc-900/80 overflow-x-auto shrink-0">
        {panels.map((panel, index) => {
          const active = panel.id === activePanelId;
          return (
            <button
              key={panel.id}
              onClick={() => onActivate(panel.id)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(index));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(from) && from !== index) onReorder(from, index);
              }}
              className={cn(
                'flex items-center gap-2 px-3 border-t-2 cursor-pointer transition-colors text-xs',
                active
                  ? 'border-t-[var(--accent-color)] bg-zinc-950 text-zinc-200'
                  : 'border-t-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
              )}
            >
              <span className="whitespace-nowrap">{panel.title}</span>
              <span
                onClick={(e) => { e.stopPropagation(); onClose(panel.id); }}
                className="opacity-50 hover:opacity-100"
              >
                <X size={11} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative flex-1 min-h-0">
        {panels.map((panel) => (
          <div
            key={panel.id}
            className="absolute inset-0"
            style={{
              visibility: panel.id === activePanelId ? 'visible' : 'hidden',
              pointerEvents: panel.id === activePanelId ? 'auto' : 'none',
            }}
          >
            {renderContent(panel)}
          </div>
        ))}
      </div>
    </div>
  );
}
