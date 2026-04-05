import { useEffect, useRef, useCallback, useState } from 'react';
import { MessageSquare, PanelLeftOpen, PanelLeftClose, RotateCcw, Trash2 } from 'lucide-react';
import { useAgentChatStore } from '@/stores/agent-chat-store';
import { api } from '@/api/client';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentInput } from './AgentInput';
import { MessageBubble } from './MessageBubble';
import { ConversationList } from './ConversationList';
import { SetupBanner } from './SetupBanner';
import { ModelSelector } from './ModelSelector';
import type { AgentStreamEvent } from '../../../shared/types';

export function AgentPanel() {
  const store = useAgentChatStore();
  const activeConv = store.activeConversation();

  const [showSidebar, setShowSidebar] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Track the IPC-assigned conversationId (different from Zustand convId)
  const ipcConversationIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Ensure there's an active conversation on first render
  useEffect(() => {
    if (!store.activeConversationId) {
      store.createConversation('New Chat');
    }
  }, []);

  // Cleanup stream listener on unmount or conversation switch
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [store.activeConversationId]);

  // Auto-scroll to bottom as messages arrive
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConv?.messages.length, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 80);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const convId = store.activeConversationId;
      if (!convId || isRunning) return;

      store.addMessage(convId, { role: 'user', content: text });
      store.setStreaming(convId, true);
      setIsRunning(true);
      setAutoScroll(true);

      // Build messages snapshot (exclude streaming placeholder)
      const snapshot = store.activeConversation()?.messages.filter((m) => !m.isStreaming) ?? [];

      // Accumulated content for finalization
      let accumulatedContent = '';

      try {
        // FIX #1: Send FIRST to get server-assigned conversationId
        const { conversationId } = await api.agent.send({
          endpointId: store.selectedEndpointId ?? 0,
          modelId: store.selectedModelId,
          messages: snapshot,
          enableTools: store.enableTools,
        });

        // Store the IPC conversation ID for cancel
        ipcConversationIdRef.current = conversationId;

        // FIX #2: Subscribe using the SERVER-assigned conversationId, not the Zustand convId
        unsubscribeRef.current = api.agent.onStreamEvent(conversationId, (event: AgentStreamEvent) => {
          switch (event.type) {
            case 'text_delta':
              accumulatedContent += event.content;
              store.appendStreamDelta(convId, event.content);
              break;
            case 'tool_call_start':
              store.addToolCall(convId, event.toolCall);
              break;
            case 'tool_call_done':
              store.updateToolCall(convId, event.toolCallId, {
                status: event.error ? 'error' : 'success',
                result: event.result,
                error: event.error,
                endTime: Date.now(),
              });
              break;
            case 'done':
              // FIX #3: Finalize the streaming message properly
              store.finalizeStreamMessage(convId, accumulatedContent);
              setIsRunning(false);
              ipcConversationIdRef.current = null;
              // Cleanup listener
              if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = null;
              }
              break;
            case 'error':
              store.setError(event.message);
              store.finalizeStreamMessage(convId, accumulatedContent || `Error: ${event.message}`);
              setIsRunning(false);
              ipcConversationIdRef.current = null;
              if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = null;
              }
              break;
          }
        });
      } catch (err) {
        store.setError(String(err));
        store.setStreaming(convId, false);
        setIsRunning(false);
        ipcConversationIdRef.current = null;
      }
    },
    [store, isRunning],
  );

  // FIX #4: Cancel uses the IPC conversationId, not the Zustand convId
  const handleStop = useCallback(async () => {
    const convId = store.activeConversationId;
    const ipcId = ipcConversationIdRef.current;

    // Cancel using the IPC-assigned ID
    if (ipcId) {
      try {
        await api.agent.cancel(ipcId);
      } catch {
        // ignore cancel errors
      }
    }

    // Cleanup listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (convId) {
      store.finalizeStreamMessage(convId, '');
    }
    setIsRunning(false);
    ipcConversationIdRef.current = null;
  }, [store]);

  const handleNewConversation = useCallback(() => {
    store.createConversation();
  }, [store]);

  const handleClear = useCallback(() => {
    const convId = store.activeConversationId;
    if (convId) store.clearConversation(convId);
  }, [store]);

  const messages = activeConv?.messages ?? [];
  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Setup banner — self-managing, hides itself when all deps ready */}
      <SetupBanner onAllReady={() => {}} />

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {showSidebar && <ConversationList onClose={() => setShowSidebar(false)} />}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
            <button
              onClick={() => setShowSidebar((v) => !v)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title={showSidebar ? 'Hide conversations' : 'Show conversations'}
            >
              {showSidebar ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            <MessageSquare className="w-4 h-4 text-[var(--accent-color)]" strokeWidth={1.5} />

            <span className="text-sm font-medium text-zinc-200 flex-1 truncate min-w-0">
              {activeConv?.name ?? 'Agent Chat'}
            </span>

            <ModelSelector />

            {!isEmpty && (
              <button
                onClick={handleClear}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Clear messages"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={handleNewConversation}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="New conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto min-h-0"
          >
            {isEmpty ? (
              <AgentEmptyState onSuggestionClick={handleSend} />
            ) : (
              <div className="py-2">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Scroll-to-bottom nudge */}
          {!autoScroll && !isEmpty && (
            <div className="flex justify-center py-1 shrink-0">
              <button
                onClick={() => {
                  setAutoScroll(true);
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-full px-3 py-1 transition-colors"
              >
                Scroll to bottom
              </button>
            </div>
          )}

          <AgentInput
            onSend={handleSend}
            onStop={handleStop}
            isRunning={isRunning}
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}

export default AgentPanel;
