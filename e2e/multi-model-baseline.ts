/**
 * Multi-Model Baseline — Test the agent harness across models of different sizes.
 * Establishes baselines for Matt Wolfe to compare.
 *
 * Run: npx tsx e2e/multi-model-baseline.ts
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'ai/data/trainer/multi_model_baselines.jsonl');
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

// Models to test — ordered by size
const MODELS = [
  { id: 'qwen3.5-27b-claude-4.6-opus-reasoning-distilled', label: 'Qwen 3.5 27B Opus Distill', params: '27B' },
];

interface TestCase {
  prompt: string;
  expectedTools: string[];
  label: string;
}

const TESTS: TestCase[] = [
  {
    label: 'Browser Navigate',
    prompt: 'Navigate the browser to https://example.com and read the page title.',
    expectedTools: ['browser_go'],
  },
  {
    label: 'Web Search',
    prompt: 'Search the web for "artificial intelligence" and list the top 3 results.',
    expectedTools: ['web_search'],
  },
  {
    label: 'Code Execution',
    prompt: 'Use the sandbox to run this Python code: print(2 + 2)',
    expectedTools: ['sandbox'],
  },
];

let app: ElectronApplication;
let page: Page;

async function launchApp(): Promise<void> {
  console.log('Launching app (pre-built)...');

  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length! > 0,
    undefined, { timeout: 30_000 },
  );
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { win.setSize(1920, 1080); win.center(); }
  });
  await page.waitForTimeout(1500);

  // Ensure endpoint
  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
    }
  });

  // Open browser panel for browser tests
  const browserBtn = page.locator('button[title="Browser"]');
  if (await browserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await browserBtn.click();
    await page.waitForTimeout(1000);
  }
}

async function runTest(modelId: string, prompt: string, timeoutMs = 60_000): Promise<{
  toolsCalled: string[];
  responseText: string;
  error: string | null;
  elapsed: number;
}> {
  const start = Date.now();
  const result = await page.evaluate(async ({ prompt, model, timeout }: any) => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) return { toolsCalled: [], responseText: '', error: 'No endpoints', conversationId: null };

    const events: any[] = [];
    let done = false;

    const { conversationId } = await (window as any).liteBench.agent.send({
      endpointId: eps[0].id,
      modelId: model,
      messages: [{ id: '1', role: 'user', content: prompt, timestamp: Date.now() }],
      enableTools: true,
    });

    const unsub = (window as any).liteBench.agent.onStreamEvent(conversationId, (event: any) => {
      events.push(event);
      if (event.type === 'done' || event.type === 'error') done = true;
    });

    const s = Date.now();
    while (!done && Date.now() - s < timeout) {
      await new Promise(r => setTimeout(r, 200));
    }
    unsub();

    return {
      toolsCalled: events.filter(e => e.type === 'tool_call_start').map(e => e.toolCall?.name || '?'),
      toolDetails: events.filter(e => e.type === 'tool_call_start').map(e => ({
        name: e.toolCall?.name,
        args: e.toolCall?.arguments ?? e.toolCall?.args ?? null,
      })),
      toolResults: events.filter(e => e.type === 'tool_result').map(e => ({
        name: e.toolName ?? '?',
        result: typeof e.result === 'string' ? e.result.slice(0, 200) : JSON.stringify(e.result)?.slice(0, 200),
      })),
      responseText: events.filter(e => e.type === 'text_delta').map(e => e.content).join(''),
      error: events.find(e => e.type === 'error')?.message || null,
      conversationId,
    };
  }, { prompt, model: modelId, timeout: timeoutMs });

  return { ...result, elapsed: Date.now() - start };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  MULTI-MODEL BASELINE — LiteBench Agent Tool Calling   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await launchApp();

  const results: any[] = [];

  for (const model of MODELS) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  MODEL: ${model.label} (${model.params})`);
    console.log(`  ID: ${model.id}`);
    console.log(`${'═'.repeat(60)}\n`);

    let modelScore = 0;
    let modelTests = 0;

    for (const test of TESTS) {
      console.log(`  Test: ${test.label}`);
      console.log(`    Prompt: "${test.prompt.slice(0, 60)}..."`);

      const result = await runTest(model.id, test.prompt, 120_000);

      const calledExpected = test.expectedTools.every(t => result.toolsCalled.includes(t));
      const hasResponse = result.responseText.trim().length > 0;
      const noRefusal = !result.responseText.toLowerCase().includes('cannot access') &&
                        !result.responseText.toLowerCase().includes('unable to') &&
                        !result.responseText.toLowerCase().includes('i don\'t have');

      const passed = calledExpected && hasResponse && noRefusal;
      if (passed) modelScore++;
      modelTests++;

      console.log(`    Tools called: [${result.toolsCalled.join(', ')}]`);
      console.log(`    Expected: [${test.expectedTools.join(', ')}] → ${calledExpected ? '✅' : '❌'}`);
      console.log(`    Response: ${result.responseText.length} chars — "${result.responseText.slice(0, 80).replace(/\n/g, ' ')}..."`);
      console.log(`    No refusal: ${noRefusal ? '✅' : '❌'}`);
      console.log(`    Time: ${(result.elapsed / 1000).toFixed(1)}s`);
      console.log(`    Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      if (!passed && (result as any).toolDetails?.length) {
        console.log(`    --- DEBUG ---`);
        for (const td of (result as any).toolDetails) {
          console.log(`    Call: ${td.name}(${JSON.stringify(td.args)?.slice(0, 150)})`);
        }
        for (const tr of (result as any).toolResults ?? []) {
          console.log(`    Result[${tr.name}]: ${tr.result?.slice(0, 150) ?? 'null'}`);
        }
      }
      console.log();

      results.push({
        model: model.id,
        modelLabel: model.label,
        params: model.params,
        test: test.label,
        toolsCalled: result.toolsCalled,
        expectedTools: test.expectedTools,
        calledCorrectTools: calledExpected,
        responseLength: result.responseText.length,
        hasResponse,
        noRefusal,
        passed,
        elapsed: result.elapsed,
        timestamp: new Date().toISOString(),
      });
    }

    const pct = ((modelScore / modelTests) * 100).toFixed(0);
    console.log(`  ── ${model.label}: ${modelScore}/${modelTests} (${pct}%) ──\n`);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const modelScores = new Map<string, { passed: number; total: number; label: string; params: string }>();
  for (const r of results) {
    if (!modelScores.has(r.model)) {
      modelScores.set(r.model, { passed: 0, total: 0, label: r.modelLabel, params: r.params });
    }
    const entry = modelScores.get(r.model)!;
    entry.total++;
    if (r.passed) entry.passed++;
  }

  console.log('  Model                      | Params | Score | Grade');
  console.log('  ────────────────────────────┼────────┼───────┼──────');
  for (const [id, s] of modelScores.entries()) {
    const pct = (s.passed / s.total) * 100;
    const grade = pct >= 90 ? 'A' : pct >= 70 ? 'B' : pct >= 50 ? 'C' : pct >= 30 ? 'D' : 'F';
    console.log(`  ${s.label.padEnd(28)} | ${s.params.padEnd(6)} | ${pct.toFixed(0).padStart(4)}% | ${grade}`);
  }

  // Save results
  for (const r of results) {
    fs.appendFileSync(LOG_FILE, JSON.stringify(r) + '\n');
  }

  console.log(`\nResults saved to ${LOG_FILE}`);
  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
