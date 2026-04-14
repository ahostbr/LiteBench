import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentChatMessage, AgentConversation, AgentToolCall } from '../../shared/types';

function nanoid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface AgentChatState {
  conversations: AgentConversation[];
  activeConversationId: string | null;
  streamingMessageId: string | null;
  isStreaming: boolean;
  error: string | null;

  // Conversation management
  createConversation(name?: string): AgentConversation;
  deleteConversation(id: string): void;
  setActiveConversation(id: string): void;
  renameConversation(id: string, name: string): void;
  clearConversation(id: string): void;

  // Message management
  addMessage(conversationId: string, message: Omit<AgentChatMessage, 'id' | 'timestamp'>): AgentChatMessage;
  appendStreamDelta(conversationId: string, content: string): void;
  replaceStreamContent(conversationId: string, content: string): void;
  finalizeStreamMessage(conversationId: string, fullContent: string, toolCalls?: AgentToolCall[]): void;

  // Tool call management
  addToolCall(conversationId: string, toolCall: AgentToolCall): void;
  updateToolCall(conversationId: string, toolCallId: string, patch: Partial<AgentToolCall>): void;

  // Streaming state
  setStreaming(conversationId: string, isStreaming: boolean): void;
  setError(error: string | null): void;

  // Endpoint / model config
  selectedEndpointId: number | null;
  selectedModelId: string;
  enableTools: boolean;
  setEndpoint(id: number): void;
  setModel(id: string): void;
  setEnableTools(v: boolean): void;

  // Derived helpers
  activeConversation(): AgentConversation | null;
}

export const useAgentChatStore = create<AgentChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      streamingMessageId: null,
      isStreaming: false,
      error: null,
      selectedEndpointId: null,
      selectedModelId: '',
      enableTools: true,

      createConversation(name?: string) {
        const now = Date.now();
        const conversation: AgentConversation = {
          id: nanoid(),
          name: name ?? `Chat ${new Date(now).toLocaleTimeString()}`,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          conversations: [conversation, ...s.conversations],
          activeConversationId: conversation.id,
        }));
        return conversation;
      },

      deleteConversation(id) {
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          let activeConversationId = s.activeConversationId;
          if (activeConversationId === id) {
            activeConversationId = conversations.length > 0 ? conversations[0].id : null;
          }
          return { conversations, activeConversationId };
        });
      },

      setActiveConversation(id) {
        set({ activeConversationId: id });
      },

      renameConversation(id, name) {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, name, updatedAt: Date.now() } : c,
          ),
        }));
      },

      clearConversation(id) {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages: [], updatedAt: Date.now() } : c,
          ),
        }));
      },

      addMessage(conversationId, message) {
        const msg: AgentChatMessage = {
          ...message,
          id: nanoid(),
          timestamp: Date.now(),
        };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() }
              : c,
          ),
        }));
        return msg;
      },

      appendStreamDelta(conversationId, content) {
        const { streamingMessageId } = get();
        if (!streamingMessageId) return;
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              updatedAt: Date.now(),
              messages: c.messages.map((m) =>
                m.id === streamingMessageId
                  ? { ...m, content: m.content + content }
                  : m,
              ),
            };
          }),
        }));
      },

      replaceStreamContent(conversationId, content) {
        const { streamingMessageId } = get();
        if (!streamingMessageId) return;
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              updatedAt: Date.now(),
              messages: c.messages.map((m) =>
                m.id === streamingMessageId
                  ? { ...m, content }
                  : m,
              ),
            };
          }),
        }));
      },

      finalizeStreamMessage(conversationId, fullContent, toolCalls) {
        const { streamingMessageId } = get();
        set((s) => ({
          streamingMessageId: null,
          isStreaming: false,
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              updatedAt: Date.now(),
              messages: c.messages.map((m) => {
                if (m.id !== streamingMessageId) return m;
                return {
                  ...m,
                  content: fullContent,
                  toolCalls: toolCalls ?? m.toolCalls,
                  isStreaming: false,
                };
              }),
            };
          }),
        }));
      },

      addToolCall(conversationId, toolCall) {
        const { streamingMessageId } = get();
        if (!streamingMessageId) {
          console.warn('[agent-store] addToolCall: no active streaming message — dropped');
          return;
        }
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== streamingMessageId) return m;
                return { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] };
              }),
            };
          }),
        }));
      },

      updateToolCall(conversationId, toolCallId, patch) {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => ({
                ...m,
                toolCalls: m.toolCalls?.map((tc) =>
                  tc.id === toolCallId ? { ...tc, ...patch } : tc,
                ),
              })),
            };
          }),
        }));
      },

      setStreaming(conversationId, isStreaming) {
        if (isStreaming) {
          // Create a blank streaming placeholder message in the conversation
          const msg: AgentChatMessage = {
            id: nanoid(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            toolCalls: [],
          };
          set((s) => ({
            streamingMessageId: msg.id,
            isStreaming: true,
            error: null,
            conversations: s.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() }
                : c,
            ),
          }));
        } else {
          set({ streamingMessageId: null, isStreaming: false });
        }
      },

      setError(error) {
        set({ error, isStreaming: false, streamingMessageId: null });
      },

      setEndpoint(id) {
        set({ selectedEndpointId: id });
      },

      setModel(id) {
        set({ selectedModelId: id });
      },

      setEnableTools(v) {
        set({ enableTools: v });
      },

      activeConversation() {
        const { conversations, activeConversationId } = get();
        return conversations.find((c) => c.id === activeConversationId) ?? null;
      },
    }),
    {
      name: 'litebench-agent-chat',
      partialize: (s) => ({
        conversations: s.conversations,
        activeConversationId: s.activeConversationId,
        selectedEndpointId: s.selectedEndpointId,
        selectedModelId: s.selectedModelId,
        enableTools: s.enableTools,
      }),
    },
  ),
);
