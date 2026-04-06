import { mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { BattleEvent, Endpoint } from '../../shared/types';
import {
  createBattle,
  createCompetitor,
  updateBattle,
  updateCompetitor,
  getPreset,
  saveScores,
} from '../db/battles-db';
import { getEndpoint } from '../db';
import { runCompetitor } from './competitor-runner';
import { collectMetrics, computeCompositeScore } from './metrics-collector';
import { applyMultiCompetitorElo, makeModelKey } from './elo-system';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per competitor

export interface BattleCompetitorConfig {
  endpointId: number;
  modelId: string;
}

export interface StartBattleConfig {
  prompt: string;
  competitors: BattleCompetitorConfig[];
  presetId?: string;
  timeoutMs?: number;
  /** If provided, uses this endpoint+model as the LLM aesthetic judge */
  judgeEndpointId?: number;
  judgeModelId?: string;
  /** Run competitors one at a time (default: true — most users have 1 GPU) */
  sequential?: boolean;
}

export type BattleEventCallback = (event: BattleEvent) => void;

interface ActiveBattle {
  battleId: string;
  controller: AbortController;
}

const activeBattles = new Map<string, ActiveBattle>();

function getBattlesRoot(): string {
  const appPath = app.isPackaged
    ? join(app.getAppPath(), '..')
    : app.getAppPath();
  return join(appPath, 'battles');
}

/**
 * Start a new battle.
 * - Creates battle + competitor rows in DB
 * - Creates output directories: battles/<battle-id>/competitor-<n>/
 * - Spawns all CompetitorRunners in parallel
 * - Phase transitions: configuring → building → judging → results
 * - Emits BattleEvents via callback
 * - Returns battleId
 */
export async function startBattle(
  config: StartBattleConfig,
  onEvent: BattleEventCallback,
): Promise<string> {
  const controller = new AbortController();

  // Resolve preset addendum
  let systemPromptAddendum: string | undefined;
  if (config.presetId) {
    const preset = getPreset(config.presetId);
    systemPromptAddendum = preset?.systemPromptAddendum;
  }

  // Create battle in DB — DB generates the UUID
  const battle = createBattle(config.prompt, config.presetId);
  const battleId = battle.id;

  activeBattles.set(battleId, { battleId, controller });

  // Resolve judge endpoint if configured
  let judgeEndpoint: Endpoint | null = null;
  if (config.judgeEndpointId) {
    judgeEndpoint = getEndpoint(config.judgeEndpointId);
  }

  // Phase: configuring → building
  updateBattle(battleId, { phase: 'building' });
  onEvent({ type: 'battle_done', battleId, phase: 'building' });

  // Create competitor rows + output dirs
  const competitorEntries: Array<{
    competitorId: string;
    endpointId: number;
    modelId: string;
    outputDir: string;
    endpoint: Endpoint;
  }> = [];

  for (let i = 0; i < config.competitors.length; i++) {
    const cfg = config.competitors[i];
    const endpoint = getEndpoint(cfg.endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint ${cfg.endpointId} not found`);
    }

    const outputDir = join(getBattlesRoot(), battleId, `competitor-${i}`);
    mkdirSync(outputDir, { recursive: true });

    const competitor = createCompetitor(
      battleId,
      cfg.endpointId,
      cfg.modelId,
      outputDir,
    );

    competitorEntries.push({
      competitorId: competitor.id,
      endpointId: cfg.endpointId,
      modelId: cfg.modelId,
      outputDir,
      endpoint,
    });
  }

  // Per-competitor timeout AbortControllers
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sequential = config.sequential !== false; // default: sequential (most users have 1 GPU)

  // Run a single competitor with timeout + abort handling
  async function executeCompetitor(entry: typeof competitorEntries[0]) {
    const { competitorId, endpoint, modelId, outputDir } = entry;

    const competitorController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      competitorController.abort();
    }, timeoutMs);

    // Abort if the whole battle is cancelled
    controller.signal.addEventListener('abort', () => {
      competitorController.abort();
    }, { once: true });

    updateCompetitor(competitorId, {
      status: 'running',
      startTime: new Date().toISOString(),
    });

    // Emit competitor_start so UI knows this one is active
    onEvent({ type: 'competitor_start', competitorId });

    try {
      const result = await runCompetitor({
        competitorId,
        battleId,
        endpoint,
        modelId,
        outputDir,
        prompt: config.prompt,
        systemPromptAddendum,
        signal: competitorController.signal,
        onEvent,
      });

      clearTimeout(timeoutHandle);

      const finalStatus = result === 'completed' ? 'completed'
        : result === 'dnf' ? 'dnf'
        : 'failed';

      updateCompetitor(competitorId, {
        status: finalStatus,
        endTime: new Date().toISOString(),
      });

      return { competitorId, modelId, endpointId: entry.endpointId, status: finalStatus, outputDir };
    } catch (e) {
      clearTimeout(timeoutHandle);
      updateCompetitor(competitorId, {
        status: 'failed',
        endTime: new Date().toISOString(),
      });
      onEvent({ type: 'error', competitorId, message: e instanceof Error ? e.message : String(e) });
      return { competitorId, modelId, endpointId: entry.endpointId, status: 'failed' as const, outputDir };
    }
  }

  // Sequential (default): run one at a time — most users have 1 GPU
  // Parallel: run all at once — for power users with multi-GPU or separate endpoints
  let results: Awaited<ReturnType<typeof executeCompetitor>>[];
  if (sequential) {
    results = [];
    for (const entry of competitorEntries) {
      if (controller.signal.aborted) break;
      results.push(await executeCompetitor(entry));
    }
  } else {
    results = await Promise.all(competitorEntries.map(executeCompetitor));
  }

  if (controller.signal.aborted) {
    updateBattle(battleId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    activeBattles.delete(battleId);
    return battleId;
  }

  // Phase: building → judging
  updateBattle(battleId, { phase: 'judging' });
  onEvent({ type: 'battle_done', battleId, phase: 'judging' });

  // Collect metrics for each completed competitor
  const metricsConfig = judgeEndpoint && config.judgeModelId
    ? { judgeEndpoint, judgeModelId: config.judgeModelId }
    : {};

  await Promise.all(
    results.map(async (r) => {
      if (r.status !== 'completed') return;

      const metrics = await collectMetrics(r.outputDir, metricsConfig);
      saveScores(r.competitorId, metrics);

      // Persist composite score on the competitor row for display/sorting
      const compositeScore = computeCompositeScore(metrics);
      updateCompetitor(r.competitorId, { score: compositeScore });

      onEvent({ type: 'metrics_ready', competitorId: r.competitorId, metrics });
    }),
  );

  // Phase: judging → results (auto-transition — human judging happens via IPC)
  updateBattle(battleId, {
    phase: 'results',
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  onEvent({ type: 'battle_done', battleId, phase: 'results' });

  activeBattles.delete(battleId);
  return battleId;
}

/**
 * Cancel an active battle by ID.
 */
export function cancelBattle(battleId: string): boolean {
  const active = activeBattles.get(battleId);
  if (!active) return false;
  active.controller.abort();
  activeBattles.delete(battleId);
  return true;
}

/**
 * Apply ELO after human picks a winner.
 * competitorIds ordered by placement: [winner, 2nd, 3rd, ...]
 */
export function recordJudgment(
  battleId: string,
  competitorIds: string[],
  competitorEndpointModelPairs: Array<{ endpointId: number; modelId: string }>,
  isDraw = false,
): void {
  const modelKeys = competitorEndpointModelPairs.map((p) =>
    makeModelKey(p.endpointId, p.modelId),
  );

  applyMultiCompetitorElo(modelKeys, isDraw);

  const winnerId = isDraw ? undefined : competitorIds[0];
  updateBattle(battleId, {
    winnerId,
    status: 'completed',
    completedAt: new Date().toISOString(),
  });
}
