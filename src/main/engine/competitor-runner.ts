import { existsSync } from 'fs';
import { join } from 'path';
import type { AgentStreamEvent, BattleEvent, Endpoint } from '../../shared/types';
import { streamAgentChat } from './agent-runner';
import { setWriteFileContext, clearWriteFileContext } from './tool-registry';

export interface CompetitorRunConfig {
  competitorId: string;
  battleId: string;
  endpoint: Endpoint;
  modelId: string;
  outputDir: string;
  prompt: string;
  systemPromptAddendum?: string;
  signal: AbortSignal;
  onEvent: (event: BattleEvent) => void;
}

const WEBSITE_SYSTEM_PROMPT = `You are a skilled web developer tasked with generating a complete website.

Your ONLY job is to use the write_file tool to create HTML, CSS, and JavaScript files.

Rules:
1. ALWAYS start by writing index.html — this is the entry point.
2. You may create additional files: styles.css, script.js, etc.
3. Write complete, self-contained files. Do not use placeholder comments.
4. Use modern CSS (flexbox, grid, custom properties). No external CSS frameworks.
5. Make the design visually polished — good typography, color palette, whitespace.
6. Only use external fonts from Google Fonts if essential — prefer system fonts.
7. Do NOT use images from external URLs — use CSS backgrounds, gradients, or SVG.
8. Make the site responsive (works on mobile and desktop).
9. After writing all files, stop. Do not explain what you built.`;

/**
 * Run a single competitor in a battle.
 * Wraps agent-runner.ts, sets up write_file output context, streams events back.
 *
 * Returns 'completed' | 'failed' | 'dnf'.
 */
export async function runCompetitor(config: CompetitorRunConfig): Promise<'completed' | 'failed' | 'dnf'> {
  const {
    competitorId,
    endpoint,
    modelId,
    outputDir,
    prompt,
    systemPromptAddendum,
    signal,
    onEvent,
  } = config;

  // Set the output dir context so write_file tool writes to the right location.
  // contextKey is threaded through streamAgentChat → executeTool → write_file executor
  // so parallel competitors each resolve their own output directory.
  setWriteFileContext(`arena-${competitorId}`, outputDir);

  try {
    onEvent({ type: 'competitor_start', competitorId, modelId });

    // Build the user message
    const userMessage = systemPromptAddendum
      ? `${prompt}\n\nAdditional requirements:\n${systemPromptAddendum}`
      : prompt;

    const messages = [
      {
        id: `${competitorId}-user`,
        role: 'user' as const,
        content: userMessage,
        timestamp: Date.now(),
      },
    ];

    await streamAgentChat(
      endpoint,
      modelId,
      messages,
      true, // always enable tools for arena
      signal,
      (event: AgentStreamEvent) => {
        switch (event.type) {
          case 'text_delta':
            onEvent({ type: 'text_delta', competitorId, content: event.content });
            break;

          case 'tool_call_start':
            onEvent({ type: 'tool_call', competitorId, toolCall: event.toolCall });
            break;

          case 'tool_call_done':
            // Emit file_written AFTER the tool has executed and the file exists on disk
            if (event.result && typeof event.result === 'string' && event.result.startsWith('File written:')) {
              // Parse the filename from the result — format: "File written: <path> (<size> bytes)"
              const match = event.result.match(/^File written: (.+?) \(/);
              if (match) {
                const writtenPath = match[1];
                const filename = writtenPath.split(/[/\\]/).pop() ?? 'unknown';
                onEvent({
                  type: 'file_written',
                  competitorId,
                  filename,
                  path: writtenPath,
                });
              }
            }
            break;

          case 'error':
            onEvent({ type: 'error', competitorId, message: event.message });
            break;

          case 'done':
            break;
        }
      },
      `arena-${competitorId}`, // unique browser context key per competitor
      WEBSITE_SYSTEM_PROMPT,
    );

    // Check if index.html was actually produced
    const indexPath = join(outputDir, 'index.html');
    const hasOutput = existsSync(indexPath);

    if (signal.aborted) {
      clearWriteFileContext(`arena-${competitorId}`);
      onEvent({ type: 'competitor_done', competitorId, status: 'failed' });
      return 'failed';
    }

    if (!hasOutput) {
      // Model ran but produced no index.html — DNF
      clearWriteFileContext(`arena-${competitorId}`);
      onEvent({ type: 'competitor_done', competitorId, status: 'dnf' });
      return 'dnf';
    }

    clearWriteFileContext(`arena-${competitorId}`);
    onEvent({ type: 'competitor_done', competitorId, status: 'completed' });
    return 'completed';
  } catch (e) {
    clearWriteFileContext(`arena-${competitorId}`);
    const message = e instanceof Error ? e.message : String(e);
    onEvent({ type: 'error', competitorId, message });
    onEvent({ type: 'competitor_done', competitorId, status: 'failed' });
    return 'failed';
  }
}
