import { ipcMain, WebContents } from 'electron';
import { getEndpoint } from '../db';
import { streamAgentChat } from '../engine/agent-runner';
import { checkDependencies, installDependency } from '../engine/setup-checker';
import type { AgentChatMessage, AgentSendRequest, AgentStreamEvent } from '../../shared/types';

interface ActiveChat {
  controller: AbortController;
}

const activeChats = new Map<string, ActiveChat>();

function emitStreamEvent(
  sender: WebContents,
  conversationId: string,
  event: AgentStreamEvent,
): void {
  if (!sender.isDestroyed()) {
    sender.send(`bench:agent:stream:${conversationId}`, event);
  }
}

export function registerAgentHandlers(): void {
  ipcMain.handle('bench:agent:send', async (ipcEvent, request: AgentSendRequest) => {
    const endpoint = getEndpoint(request.endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint ${request.endpointId} not found`);
    }

    const conversationId = crypto.randomUUID();
    const controller = new AbortController();
    activeChats.set(conversationId, { controller });

    const sender = ipcEvent.sender;

    setTimeout(() => {
      void streamAgentChat(
        endpoint,
        request.modelId,
        request.messages,
        request.enableTools,
        controller.signal,
        (event) => {
          emitStreamEvent(sender, conversationId, event);
          if (event.type === 'done' || event.type === 'error') {
            activeChats.delete(conversationId);
          }
        },
        conversationId, // pass as browser context key for per-conversation sessions
      );
    }, 0);

    return { conversationId };
  });

  ipcMain.handle('bench:agent:cancel', (_event, conversationId: string) => {
    const active = activeChats.get(conversationId);
    if (!active) {
      throw new Error(`No active chat with ID: ${conversationId}`);
    }
    active.controller.abort();
    activeChats.delete(conversationId);
  });

  // History is managed in renderer via localStorage/Zustand — main process returns empty array
  ipcMain.handle(
    'bench:agent:history',
    (_event, _conversationId: string): AgentChatMessage[] => {
      return [];
    },
  );

  ipcMain.handle('bench:agent:check-setup', async () => {
    return checkDependencies();
  });

  ipcMain.handle('bench:agent:install-dep', async (_event, name: string) => {
    return installDependency(name);
  });
}
