import { dialog, ipcMain, WebContents } from 'electron';
import { extname } from 'path';
import { writeFile } from 'fs/promises';
import {
  buildExportContent,
  compareRuns,
  completeBenchmarkRun,
  createBenchmarkRun,
  deleteRun,
  failBenchmarkRun,
  getEndpoint,
  getRun,
  getSuite,
  getSuiteCases,
  importLegacyRun,
  insertTestResult,
  listRuns,
} from '../db';
import { runAgentBenchmarkStream } from '../engine/agent-benchmark-runner';
import { runBenchmarkStream } from '../engine/runner';
import type {
  BenchmarkRunRequest,
  BenchmarkStreamEvent,
  BenchmarkTestDone,
  ExportFormat,
} from '../../shared/types';

interface ActiveRun {
  cancelled: boolean;
  sender: WebContents;
}

const activeRuns = new Map<number, ActiveRun>();

function emitBenchmarkEvent(sender: WebContents, payload: BenchmarkStreamEvent): void {
  if (!sender.isDestroyed()) {
    sender.send('bench:run:event', payload);
  }
}

async function executeRun(
  sender: WebContents,
  runId: number,
  request: BenchmarkRunRequest,
): Promise<void> {
  const endpoint = getEndpoint(request.endpoint_id);
  if (!endpoint) {
    throw new Error('Endpoint not found');
  }

  const suite = getSuite(request.suite_id);
  if (!suite) {
    throw new Error('Test suite not found');
  }

  const testCases = getSuiteCases(request.suite_id);
  if (testCases.length === 0) {
    throw new Error('Test suite has no test cases');
  }

  const runFn = request.is_agent_run ? runAgentBenchmarkStream : runBenchmarkStream;

  try {
    const { summary, cancelled } = await runFn({
      endpoint,
      run_id: runId,
      request,
      testCases,
      isCancelled: () => activeRuns.get(runId)?.cancelled ?? true,
      onEvent: async (event) => {
        if (event.event === 'test_done') {
          const result = event.data as BenchmarkTestDone;
          result.id = insertTestResult(runId, result);
        }
        emitBenchmarkEvent(sender, event);
      },
    });

    if (cancelled) {
      failBenchmarkRun(runId, 'cancelled');
      emitBenchmarkEvent(sender, {
        run_id: runId,
        event: 'cancelled',
        data: { run_id: runId },
      });
      return;
    }

    if (summary) {
      completeBenchmarkRun(runId, summary);
    } else {
      failBenchmarkRun(runId, 'failed');
    }
  } catch (error) {
    failBenchmarkRun(runId, 'failed');
    emitBenchmarkEvent(sender, {
      run_id: runId,
      event: 'error',
      data: {
        run_id: runId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    activeRuns.delete(runId);
  }
}

function getExportExtension(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return '.csv';
    case 'md':
      return '.md';
    case 'json':
    default:
      return '.json';
  }
}

export function registerBenchmarksHandlers(): void {
  ipcMain.handle('bench:run:start', async (event, request: BenchmarkRunRequest) => {
    if (!getEndpoint(request.endpoint_id)) {
      throw new Error('Endpoint not found');
    }
    if (!getSuite(request.suite_id)) {
      throw new Error('Test suite not found');
    }

    const runId = createBenchmarkRun(request);
    activeRuns.set(runId, {
      cancelled: false,
      sender: event.sender,
    });

    setTimeout(() => {
      void executeRun(event.sender, runId, request);
    }, 0);

    return {
      run_id: runId,
      status: 'running' as const,
    };
  });

  ipcMain.handle('bench:run:cancel', (_event, runId: number) => {
    const active = activeRuns.get(runId);
    if (!active) {
      throw new Error('No active run with that ID');
    }
    active.cancelled = true;
    return { message: 'Cancellation requested' };
  });

  ipcMain.handle('bench:runs:list', () => {
    return listRuns();
  });

  ipcMain.handle('bench:run:get', (_event, runId: number) => {
    const run = getRun(runId);
    if (!run) {
      throw new Error('Run not found');
    }
    return run;
  });

  ipcMain.handle('bench:run:delete', (_event, runId: number) => {
    deleteRun(runId);
  });

  ipcMain.handle('bench:runs:compare', (_event, runIds: number[]) => {
    return { runs: compareRuns(runIds) };
  });

  ipcMain.handle(
    'bench:run:export',
    async (_event, runId: number, format: ExportFormat) => {
      const run = getRun(runId);
      if (!run) {
        throw new Error('Run not found');
      }

      const extension = getExportExtension(format);
      const result = await dialog.showSaveDialog({
        title: 'Export benchmark run',
        defaultPath: `run_${runId}${extension}`,
        filters: [
          {
            name: format.toUpperCase(),
            extensions: [extension.replace('.', '')],
          },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      let outputPath = result.filePath;
      if (!extname(outputPath)) {
        outputPath = `${outputPath}${extension}`;
      }

      await writeFile(outputPath, buildExportContent(runId, format), 'utf-8');
      return { ok: true, path: outputPath };
    },
  );

  ipcMain.handle('bench:run:pick-import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select legacy benchmark JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('bench:run:import', (_event, filePath: string) => {
    return importLegacyRun(filePath);
  });
}
