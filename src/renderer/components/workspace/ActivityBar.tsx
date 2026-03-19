import { LayoutDashboard, Play, History, FlaskConical, Settings } from 'lucide-react';
import { useWorkspaceStore, type PanelType } from '@/stores/workspace-store';
import { cn } from '@/lib/utils';

const panelIcons: { type: PanelType; icon: React.ElementType; label: string }[] = [
  { type: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { type: 'runner', icon: Play, label: 'Run Benchmark' },
  { type: 'results', icon: History, label: 'Results' },
  { type: 'tests', icon: FlaskConical, label: 'Test Suites' },
];

export function ActivityBar() {
  const { panels, togglePanelType } = useWorkspaceStore();
  const hasPanelType = (type: PanelType) => panels.some((p) => p.type === type);

  return (
    <div className="w-12 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-3 gap-1 shrink-0">
      {panelIcons.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => togglePanelType(type)}
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200',
            hasPanelType(type)
              ? 'text-[var(--accent-color)] bg-[var(--accent-color)]/10'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          )}
          title={label}
        >
          <Icon size={18} strokeWidth={1.5} />
        </button>
      ))}

      <div className="flex-1" />

      {/* Settings at bottom */}
      <button
        onClick={() => togglePanelType('settings')}
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200',
          hasPanelType('settings')
            ? 'text-[var(--accent-color)] bg-[var(--accent-color)]/10'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
        )}
        title="Settings"
      >
        <Settings size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}
