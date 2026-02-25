import { LayoutDashboard, Play, History, FlaskConical, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Page = 'dashboard' | 'runner' | 'results' | 'tests';

interface SidebarProps {
  active: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'runner', label: 'Run Benchmark', icon: <Play size={18} /> },
  { id: 'results', label: 'Results', icon: <History size={18} /> },
  { id: 'tests', label: 'Test Suites', icon: <FlaskConical size={18} /> },
];

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-zinc-800">
        <Zap size={20} className="text-blue-500" />
        <span className="font-semibold text-sm tracking-tight">LiteBench</span>
      </div>
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active === item.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-zinc-800 text-[11px] text-zinc-600">
        LLM Benchmark Studio
      </div>
    </aside>
  );
}
