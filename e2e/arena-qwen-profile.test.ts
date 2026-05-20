import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MODEL_A = process.env.LITEBENCH_MODEL_A ?? 'qwen/qwen3.6-27b';
const MODEL_B = process.env.LITEBENCH_MODEL_B ?? 'qwen3.6-27b-claude-opus-reasoning-distill-v2';
const PRESET_ID = process.env.LITEBENCH_PRESET_ID ?? 'landing-page';
const REASONING_MODE = process.env.LITEBENCH_REASONING_MODE as 'default' | 'off' | undefined;
const MAX_TOKENS = Number(process.env.LITEBENCH_MAX_TOKENS ?? '32768');
const PROMPT =
  process.env.LITEBENCH_PROMPT ??
  'Build a modern landing page for an AI productivity tool called "FlowState". ' +
    'Include a hero section with headline and CTA button, a 3-column feature grid, ' +
    'a testimonials section with 2 quotes, and a footer. Use a dark theme with ' +
    'purple and blue gradient accents. Make it visually striking and professional. ' +
    'Use write_file to create index.html with all CSS inline.';

test.setTimeout(20 * 60 * 1000);

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  execSync('pnpm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });

  const devDb = path.join(PROJECT_ROOT, 'backend', 'litebench.db');
  const builtDb = path.join(PROJECT_ROOT, 'out', 'main', 'backend', 'litebench.db');
  fs.mkdirSync(path.dirname(builtDb), { recursive: true });
  if (fs.existsSync(devDb)) fs.copyFileSync(devDb, builtDb);

  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('profiles current Arena with explicit models', async () => {
  const endpointInfo = await page.evaluate(async () => {
    let endpoints = await window.liteBench.endpoints.list();
    if (!endpoints || endpoints.length === 0) {
      await window.liteBench.endpoints.create({
        name: 'LM Studio',
        base_url: 'http://localhost:1234/v1',
        api_key: 'lm-studio',
      });
      endpoints = await window.liteBench.endpoints.list();
    }
    if (!endpoints || endpoints.length === 0) throw new Error('No endpoints available');

    const lmStudio =
      endpoints.find((endpoint) => endpoint.base_url.includes('localhost:1234')) ??
      endpoints.find((endpoint) => endpoint.name.toLowerCase().includes('lm studio')) ??
      endpoints[0];

    const discovered = await window.liteBench.endpoints.models(lmStudio.id);
    return {
      endpointId: lmStudio.id,
      endpointName: lmStudio.name,
      baseUrl: lmStudio.base_url,
      models: discovered.models.map((model) => model.id),
    };
  });

  console.log(`ENDPOINT ${endpointInfo.endpointName} :: ${endpointInfo.baseUrl}`);
  console.log(`MODEL_PRESENT ${MODEL_A} :: ${endpointInfo.models.includes(MODEL_A)}`);
  console.log(`MODEL_PRESENT ${MODEL_B} :: ${endpointInfo.models.includes(MODEL_B)}`);
  console.log(`PRESET ${PRESET_ID}`);
  console.log(`REASONING_MODE ${REASONING_MODE ?? 'default'}`);
  console.log(`MAX_TOKENS ${MAX_TOKENS}`);

  await page.evaluate(() => {
    const w = window as any;
    if (w.__arenaUnsub) w.__arenaUnsub();
    w.__arenaEvents = [];
    w.__arenaUnsub = window.liteBench.arena.onEvent((event: any) => {
      w.__arenaEvents.push({ ...event, capturedAt: Date.now() });
    });
  });

  const battle = await page.evaluate(async ({ endpointId, prompt, modelA, modelB, presetId, reasoningMode, maxTokens }) => {
    return window.liteBench.arena.startBattle({
      prompt,
      presetId,
      reasoningMode,
      maxTokens,
      competitors: [
        { endpointId, modelId: modelA },
        { endpointId, modelId: modelB },
      ],
      sequential: true,
      timeoutMs: 480000,
    } as any);
  }, {
    endpointId: endpointInfo.endpointId,
    prompt: PROMPT,
    modelA: MODEL_A,
    modelB: MODEL_B,
    presetId: PRESET_ID,
    reasoningMode: REASONING_MODE,
    maxTokens: MAX_TOKENS,
  });

  console.log(`BATTLE ${battle.id}`);

  const startedAt = Date.now();
  let snapshot: any = null;
  while (Date.now() - startedAt < 18 * 60 * 1000) {
    await page.waitForTimeout(10000);
    snapshot = await page.evaluate(async (battleId) => {
      const w = window as any;
      const battle = await window.liteBench.arena.getBattle(battleId);
      const events = w.__arenaEvents ?? [];
      return {
        battle,
        events,
        metrics: events.filter((event: any) => event.type === 'metrics_ready'),
        done: events.filter((event: any) => event.type === 'competitor_done'),
        failed: events.filter((event: any) => event.type === 'competitor_failed'),
        errors: events.filter((event: any) => event.type === 'error'),
        toolCalls: events.filter((event: any) => event.type === 'tool_call'),
        textDeltas: events.filter((event: any) => event.type === 'text_delta'),
      };
    }, battle.id);

    console.log(
      `PHASE ${snapshot?.battle?.phase} DONE ${snapshot?.done?.length ?? 0} ` +
        `METRICS ${snapshot?.metrics?.length ?? 0} FAILED ${snapshot?.failed?.length ?? 0} ` +
        `ERRORS ${snapshot?.errors?.length ?? 0} TOOL_CALLS ${snapshot?.toolCalls?.length ?? 0}`,
    );
    if (snapshot?.battle?.phase === 'results') break;
  }

  expect(snapshot?.battle?.phase).toBe('results');

  for (const error of snapshot.errors ?? []) {
    console.log(`ERROR_EVENT ${error.competitorId ?? 'battle'} :: ${error.message}`);
  }

  for (const text of (snapshot.textDeltas ?? []).slice(-10)) {
    const content = String(text.content ?? '').replace(/\s+/g, ' ').trim();
    console.log(`TEXT_DELTA ${text.competitorId} :: ${content.slice(0, 240)}`);
  }

  for (const competitor of snapshot.battle.competitors) {
    const compDir = competitor.outputDir;
    const files = fs.existsSync(compDir) ? fs.readdirSync(compDir) : [];
    const indexPath = path.join(compDir, 'index.html');
    const indexSize = fs.existsSync(indexPath) ? fs.statSync(indexPath).size : 0;

    console.log(`COMPETITOR ${competitor.modelId}`);
    console.log(`STATUS ${competitor.status}`);
    console.log(`OUTPUT ${compDir}`);
    console.log(`FILES ${files.join(', ') || '(none)'}`);
    console.log(`INDEX_BYTES ${indexSize}`);

    const metricEvent = snapshot.metrics.find((event: any) => event.competitorId === competitor.id);
    if (metricEvent) {
      for (const metric of metricEvent.metrics) {
        console.log(`METRIC ${competitor.modelId} :: ${metric.name} :: ${metric.score} :: ${metric.weight}`);
        if (metric.details) {
          console.log(`DETAIL ${competitor.modelId} :: ${metric.name} :: ${metric.details}`);
        }
      }
    }
  }
});
