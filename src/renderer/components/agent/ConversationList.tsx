import { useState, memo } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Download,
  Pencil,
  Check,
  X,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentChatStore } from '@/stores/agent-chat-store';
import type { AgentConversation } from '../../../shared/types';

const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onExport,
}: {
  conversation: AgentConversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onExport: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name);

  const handleSave = () => {
    if (editName.trim()) onRename(editName.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(conversation.name);
    setIsEditing(false);
  };

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const preview = lastMessage?.content?.slice(0, 50) || 'No messages';
  const count = conversation.messages.length;

  return (
    <div
      className={cn(
        'group relative p-2 rounded-lg cursor-pointer transition-colors border',
        isActive
          ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)]/30'
          : 'hover:bg-zinc-800 border-transparent',
      )}
      onClick={!isEditing ? onSelect : undefined}
    >
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
            className="flex-1 px-2 py-1 text-xs bg-zinc-950 border border-zinc-600 rounded focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            className="p-1 text-green-400 hover:bg-green-500/20 rounded"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancel(); }}
            className="p-1 text-red-400 hover:bg-red-500/20 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <MessageSquare
              className={cn(
                'w-3.5 h-3.5 shrink-0 mt-0.5',
                isActive ? 'text-[var(--accent-color)]' : 'text-zinc-500',
              )}
            />
            <div className="flex-1 min-w-0 pr-12">
              <div className="text-xs font-medium text-zinc-200 truncate">{conversation.name}</div>
              <div className="text-[10px] text-zinc-500 truncate mt-0.5">{preview}</div>
            </div>
          </div>

          {/* Hover actions */}
          <div className="absolute top-1.5 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded"
              title="Rename"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onExport(); }}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded"
              title="Export as Markdown"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="absolute bottom-1.5 right-2">
            <span className="text-[10px] text-zinc-600">
              {count} msg{count !== 1 ? 's' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
});

interface ConversationListProps {
  onClose: () => void;
}

export function ConversationList({ onClose }: ConversationListProps) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    setActiveConversation,
    deleteConversation,
    renameConversation,
  } = useAgentChatStore();

  const handleExport = (convId: string) => {
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;

    const lines: string[] = [`# ${conv.name}\n`];
    for (const msg of conv.messages) {
      lines.push(`## ${msg.role === 'user' ? 'You' : 'Agent'}\n`);
      if (msg.content) lines.push(msg.content + '\n');
    }
    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${convId.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-48 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-300">Conversations</span>
        <button
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
          title="Close sidebar"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New chat button */}
      <div className="p-2 border-b border-zinc-800">
        <button
          onClick={() => createConversation()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--accent-color)]/15 hover:bg-[var(--accent-color)]/25 text-[var(--accent-color)] rounded-lg transition-colors border border-[var(--accent-color)]/20"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center text-xs text-zinc-600 py-4">No conversations yet</div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onSelect={() => setActiveConversation(conv.id)}
              onDelete={() => deleteConversation(conv.id)}
              onRename={(name) => renameConversation(conv.id, name)}
              onExport={() => handleExport(conv.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-600 text-center">
        {conversations.length} / 20 chats
      </div>
    </div>
  );
}

export default ConversationList;
