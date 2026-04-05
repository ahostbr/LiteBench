import { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ToolCallCard } from '@/components/agent/ToolCallCard';
import type { LiveAgentTask } from '../../../shared/types';

interface AgentTestProgressProps {
  task: LiveAgentTask;
}

export function AgentTestProgress({ task }: AgentTestProgressProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [task.textSoFar, task.toolCalls.length]);

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 overflow-hidden">
      {/* Task header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700 bg-zinc-800/40">
        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200 truncate">{task.name}</span>
            <span className="text-xs text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800 shrink-0">
              {task.category}
            </span>
          </div>
        </div>
      </div>

      {/* Task prompt */}
      <div className="px-4 py-3 border-b border-zinc-700/60 bg-zinc-950/40">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Task</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{task.prompt}</p>
      </div>

      {/* Live activity stream */}
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto px-4 py-3 space-y-2"
      >
        {/* Streaming text */}
        {task.textSoFar && (
          <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono text-[12px]">
            {task.textSoFar}
            <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        )}

        {/* Tool calls */}
        {task.toolCalls.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} compact />
        ))}

        {/* Empty state while waiting */}
        {!task.textSoFar && task.toolCalls.length === 0 && (
          <div className="flex items-center gap-2 text-zinc-600 text-xs py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Waiting for agent response...</span>
          </div>
        )}
      </div>
    </div>
  );
}
