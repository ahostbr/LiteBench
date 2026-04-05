import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlashCommandMenu, SLASH_COMMANDS } from './SlashCommandMenu';
import type { SlashCommand } from './SlashCommandMenu';

interface AgentInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isRunning: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function AgentInput({
  onSend,
  onStop,
  isRunning,
  disabled = false,
  placeholder = 'Ask the agent anything... (/ for commands)',
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);

    // Detect slash command trigger
    if (v.startsWith('/') && !v.includes(' ')) {
      setSlashFilter(v.slice(1));
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
      setSlashFilter('');
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen) {
        const filtered = slashFilter
          ? SLASH_COMMANDS.filter(
              (c) =>
                c.name.toLowerCase().includes(slashFilter.toLowerCase()) ||
                c.description.toLowerCase().includes(slashFilter.toLowerCase()),
            )
          : SLASH_COMMANDS;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          if (filtered[highlightedIndex]) {
            handleSlashSelect(filtered[highlightedIndex]);
          }
          return;
        }
        if (e.key === 'Escape') {
          setSlashOpen(false);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [slashOpen, slashFilter, highlightedIndex, value],
  );

  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      setValue(cmd.name + ' ');
      setSlashOpen(false);
      textareaRef.current?.focus();
    },
    [],
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isRunning || disabled) return;
    onSend(trimmed);
    setValue('');
    setSlashOpen(false);
  }, [value, isRunning, disabled, onSend]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="relative px-3 pb-3 pt-2 border-t border-zinc-800 bg-zinc-950">
      {/* Slash command menu — above input */}
      <SlashCommandMenu
        isOpen={slashOpen}
        filter={slashFilter}
        onSelect={handleSlashSelect}
        onClose={() => setSlashOpen(false)}
        highlightedIndex={highlightedIndex}
        setHighlightedIndex={setHighlightedIndex}
      />

      <div
        className={cn(
          'flex items-end gap-2 bg-zinc-900 border rounded-xl px-3 py-2 transition-all duration-200',
          disabled ? 'border-zinc-800 opacity-50' : 'border-zinc-700 focus-within:border-[var(--accent-color)]/50',
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className={cn(
            'flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 resize-none',
            'focus:outline-none min-h-[24px] max-h-[200px] leading-6',
          )}
        />

        {/* Send / Stop button */}
        <div className="flex items-center gap-1 shrink-0 pb-0.5">
          {isRunning ? (
            <button
              onClick={onStop}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors"
              title="Stop agent"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200',
                canSend
                  ? 'bg-[var(--accent-color)]/20 border border-[var(--accent-color)]/30 text-[var(--accent-color)] hover:bg-[var(--accent-color)]/30'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-600 cursor-not-allowed',
              )}
              title="Send message (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 mt-1 px-1">
        Enter to send &middot; Shift+Enter for newline &middot; / for commands
      </p>
    </div>
  );
}

export default AgentInput;
