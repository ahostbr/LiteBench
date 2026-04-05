import { MessageSquare, Zap, FileSearch, Terminal, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  { label: 'Run a quick benchmark analysis', icon: Zap, desc: 'Analyze results with AI' },
  { label: 'Summarize my latest results', icon: FileSearch, desc: 'Get insights from data' },
  { label: 'Help me write a test suite', icon: Terminal, desc: 'Generate test cases' },
  { label: 'Compare model performance', icon: Cpu, desc: 'Side-by-side breakdown' },
];

interface AgentEmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

export function AgentEmptyState({ onSuggestionClick }: AgentEmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-8 select-none">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 flex items-center justify-center mb-4">
        <MessageSquare className="w-7 h-7 text-[var(--accent-color)]" strokeWidth={1.5} />
      </div>

      {/* Title */}
      <h2 className="text-zinc-100 font-semibold text-base mb-1">Agent Chat</h2>
      <p className="text-zinc-500 text-sm text-center max-w-xs mb-8">
        Ask questions, analyze benchmarks, or get AI-powered insights about your LLM results.
      </p>

      {/* Suggestion grid */}
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
        {SUGGESTIONS.map(({ label, icon: Icon, desc }) => (
          <button
            key={label}
            onClick={() => onSuggestionClick(label)}
            className={cn(
              'flex flex-col items-start gap-1.5 p-3 rounded-xl text-left',
              'bg-zinc-900 border border-zinc-800 hover:border-zinc-600',
              'hover:bg-zinc-800 transition-all duration-200',
            )}
          >
            <Icon className="w-4 h-4 text-[var(--accent-color)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-zinc-200 leading-tight">{label}</span>
            <span className="text-[10px] text-zinc-500">{desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AgentEmptyState;
