import { memo } from 'react';
import { Bot, User, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallCard } from './ToolCallCard';
import type { AgentChatMessage } from '../../../shared/types';

interface MessageBubbleProps {
  message: AgentChatMessage;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming === true;
  const isError = !isUser && !isStreaming && message.content.startsWith('Error:');

  return (
    <div className={cn('flex gap-3 px-4 py-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          isUser
            ? 'bg-[var(--accent-color)]/20 border border-[var(--accent-color)]/30'
            : 'bg-zinc-800 border border-zinc-700',
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-[var(--accent-color)]" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-zinc-400" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0 max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {/* Role label */}
        <div className={cn('flex items-center gap-1.5 mb-1', isUser && 'flex-row-reverse')}>
          <span className="text-[11px] font-medium text-zinc-500">
            {isUser ? 'You' : 'Agent'}
          </span>
          {isStreaming && (
            <Loader2 className="w-3 h-3 text-[var(--accent-color)] animate-spin" />
          )}
          {message.timestamp && (
            <span className="text-[10px] text-zinc-600">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Tool calls (shown before message text for assistant) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5 mb-2 w-full">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} compact />
            ))}
          </div>
        )}

        {/* Message text */}
        {message.content && (
          <div
            className={cn(
              'rounded-xl px-3 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-[var(--accent-color)]/15 border border-[var(--accent-color)]/20 text-zinc-100'
                : isError
                ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-100',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : isError ? (
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{message.content}</span>
              </div>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-[var(--accent-color)] ml-0.5 rounded-sm animate-pulse" />
            )}
          </div>
        )}

        {/* Empty streaming state */}
        {isStreaming && !message.content && (!message.toolCalls || message.toolCalls.length === 0) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
