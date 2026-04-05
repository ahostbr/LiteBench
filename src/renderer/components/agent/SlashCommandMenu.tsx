import { useState, useEffect, useRef, useMemo } from 'react';
import {
  HelpCircle,
  Trash2,
  Gauge,
  Minimize2,
  History,
  Bot,
  Settings,
  FileText,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/help', description: 'Show available commands', icon: <HelpCircle className="w-3.5 h-3.5" /> },
  { name: '/clear', description: 'Clear conversation history', icon: <Trash2 className="w-3.5 h-3.5" /> },
  { name: '/context', description: 'Show token usage and context window', icon: <Gauge className="w-3.5 h-3.5" /> },
  { name: '/compact', description: 'Summarize history to save context', icon: <Minimize2 className="w-3.5 h-3.5" /> },
  { name: '/history', description: 'Show conversation history', icon: <History className="w-3.5 h-3.5" /> },
  { name: '/model', description: 'Switch AI model', icon: <Bot className="w-3.5 h-3.5" /> },
  { name: '/config', description: 'Show current configuration', icon: <Settings className="w-3.5 h-3.5" /> },
  { name: '/status', description: 'Show connection status', icon: <Activity className="w-3.5 h-3.5" /> },
  { name: '/memory', description: 'Open memory files', icon: <FileText className="w-3.5 h-3.5" /> },
];

interface SlashCommandMenuProps {
  isOpen: boolean;
  filter: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
}

export function SlashCommandMenu({
  isOpen,
  filter,
  onSelect,
  onClose,
  highlightedIndex,
  setHighlightedIndex,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = useMemo(() => {
    if (!filter) return SLASH_COMMANDS;
    const s = filter.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) => cmd.name.toLowerCase().includes(s) || cmd.description.toLowerCase().includes(s),
    );
  }, [filter]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-command-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filter, setHighlightedIndex]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
      <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
        {filteredCommands.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-500 italic">
            No commands match "/{filter}"
          </div>
        ) : (
          filteredCommands.map((cmd, index) => (
            <button
              key={cmd.name}
              data-command-item
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors',
                index === highlightedIndex
                  ? 'bg-[var(--accent-color)]/10 text-[var(--accent-color)]'
                  : 'text-zinc-300 hover:bg-zinc-800',
              )}
            >
              <span className={cn(
                'shrink-0',
                index === highlightedIndex ? 'text-[var(--accent-color)]' : 'text-zinc-500',
              )}>
                {cmd.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-mono font-medium">{cmd.name}</span>
                <span className={cn(
                  'ml-2',
                  index === highlightedIndex ? 'text-[var(--accent-color)]/70' : 'text-zinc-500',
                )}>
                  {cmd.description}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default SlashCommandMenu;
