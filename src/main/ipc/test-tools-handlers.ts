/**
 * Test-only IPC handlers for E2E testing of tool executors and harness.
 * These expose tool-registry, agent-harness internals for Playwright to call.
 * No-op in production — only registered when NODE_ENV !== 'production'.
 */
import { ipcMain, app } from 'electron';
import { toolRegistry } from '../engine/tool-registry';
import { executeTool } from '../engine/tool-executor';
import { buildSystemPrompt, isSmallModel } from '../engine/agent-harness';

export function registerTestToolsHandlers(): void {
  // Only register in development/test mode
  if (process.env.NODE_ENV === 'production') return;

  /**
   * Execute a registered tool directly by name.
   * Supports both in-process (browser) and Python-based tools.
   */
  ipcMain.handle(
    'test:tool:execute',
    async (_event, toolName: string, args: Record<string, unknown>) => {
      return executeTool(toolName, args);
    },
  );

  /**
   * Get tool schemas filtered by model size.
   * Returns array of tool names.
   */
  ipcMain.handle(
    'test:tool:schemas',
    async (_event, smallModel?: boolean) => {
      const schemas = toolRegistry.getSchemas(smallModel);
      return schemas.map((s) => s.function.name);
    },
  );

  /**
   * Build system prompt for a given model.
   */
  ipcMain.handle(
    'test:harness:prompt',
    async (_event, modelId: string) => {
      return buildSystemPrompt(modelId, []);
    },
  );

  /**
   * Check if a model is considered "small".
   */
  ipcMain.handle(
    'test:harness:is-small',
    async (_event, modelId: string) => {
      return isSmallModel(modelId);
    },
  );
}
