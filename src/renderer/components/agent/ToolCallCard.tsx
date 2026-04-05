import { useState, memo } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentToolCall, ToolCallStatus } from '../../../shared/types';

function StatusBadge({ status }: { status: ToolCallStatus }) {
  const config = {
    pending: { icon: Loader2, cls: 'text-zinc-400 bg-zinc-800', spin: false },
    running: { icon: Loader2, cls: 'text-[var(--accent-color)] bg-[var(--accent-color)]/20', spin: true },
    success: { icon: CheckCircle2, cls: 'text-green-400 bg-green-500/20', spin: false },
    error: { icon: XCircle, cls: 'text-red-400 bg-red-500/20', spin: false },
  }[status];

  const Icon = config.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', config.cls)}>
      <Icon className={cn('w-3 h-3', config.spin && 'animate-spin')} />
      {status}
    </span>
  );
}

function JsonHighlight({ data, maxLines = 10 }: { data: unknown; maxLines?: number }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  let jsonString: string;
  try {
    jsonString = JSON.stringify(data, null, 2);
  } catch {
    jsonString = String(data);
  }

  const lines = jsonString.split('\n');
  const truncated = lines.length > maxLines && !expanded;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const highlightLine = (line: string) =>
    line
      .replace(/"([^"]+)":/g, '<span class="text-cyan-400">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="text-green-400">"$1"</span>')
      .replace(/: (true|false|null)/g, ': <span class="text-purple-400">$1</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="text-yellow-400">$1</span>');

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded bg-zinc-950/80 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title="Copy JSON"
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-400" />
        ) : (
          <Copy className="w-3 h-3 text-zinc-500" />
        )}
      </button>
      <pre className="text-[11px] leading-relaxed overflow-x-auto">
        {displayLines.map((line, i) => (
          <div
            key={i}
            className="hover:bg-white/5"
            dangerouslySetInnerHTML={{ __html: highlightLine(line) }}
          />
        ))}
        {truncated && (
          <button
            onClick={() => setExpanded(true)}
            className="text-zinc-500 hover:text-zinc-300 italic text-[11px] transition-colors"
          >
            ... {lines.length - maxLines} more lines (click to expand)
          </button>
        )}
      </pre>
    </div>
  );
}

function ToolNameBadge({ name }: { name: string }) {
  const getColor = (n: string) => {
    if (n.startsWith('mcp__')) return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    if (n.includes('file') || n.includes('read') || n.includes('write')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (n.includes('bash') || n.includes('shell') || n.includes('exec')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (n.includes('search') || n.includes('glob') || n.includes('grep')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (n.includes('edit') || n.includes('patch')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  };

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border', getColor(name))}>
      <Wrench className="w-3 h-3" />
      {name}
    </span>
  );
}

interface ToolCallCardProps {
  toolCall: AgentToolCall;
  compact?: boolean;
}

export const ToolCallCard = memo(function ToolCallCard({ toolCall, compact = false }: ToolCallCardProps) {
  const [isArgsExpanded, setIsArgsExpanded] = useState(!compact);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  const hasResult = toolCall.result !== undefined || toolCall.error !== undefined;
  const duration =
    toolCall.startTime && toolCall.endTime ? toolCall.endTime - toolCall.startTime : null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center gap-2 flex-wrap">
          <ToolNameBadge name={toolCall.name} />
          <StatusBadge status={toolCall.status} />
        </div>
        {duration !== null && (
          <span className="text-[10px] text-zinc-500 shrink-0">{duration}ms</span>
        )}
      </div>

      {/* Arguments */}
      <div className="border-b border-zinc-700 last:border-b-0">
        <button
          onClick={() => setIsArgsExpanded(!isArgsExpanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {isArgsExpanded ? (
            <ChevronDown className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" />
          )}
          <span>Arguments</span>
          {!isArgsExpanded && Object.keys(toolCall.arguments).length > 0 && (
            <span className="text-[10px] opacity-60">
              ({Object.keys(toolCall.arguments).length} params)
            </span>
          )}
        </button>
        {isArgsExpanded && (
          <div className="px-3 pb-2">
            {Object.keys(toolCall.arguments).length > 0 ? (
              <JsonHighlight data={toolCall.arguments} maxLines={8} />
            ) : (
              <span className="text-zinc-600 italic">No arguments</span>
            )}
          </div>
        )}
      </div>

      {/* Result */}
      {hasResult && (
        <div>
          <button
            onClick={() => setIsResultExpanded(!isResultExpanded)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isResultExpanded ? (
              <ChevronDown className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0" />
            )}
            <span>{toolCall.error ? 'Error' : 'Result'}</span>
          </button>
          {isResultExpanded && (
            <div className="px-3 pb-2">
              {toolCall.error ? (
                <div className="text-red-400 bg-red-500/10 rounded px-2 py-1.5">{toolCall.error}</div>
              ) : (
                <JsonHighlight data={toolCall.result} maxLines={15} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Running indicator */}
      {toolCall.status === 'running' && (
        <div className="px-3 py-2 border-t border-zinc-700">
          <div className="flex items-center gap-2 text-[var(--accent-color)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Executing...</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
