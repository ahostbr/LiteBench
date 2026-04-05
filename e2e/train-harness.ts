/**
 * Harness Training Loop — Iteratively improve agent-harness.ts system prompts
 * until local models reliably use tools (especially browser tools).
 *
 * Pattern: evaluate → reflect → mutate → re-evaluate → keep/revert → repeat
 *
 * Run: npx tsx e2e/train-harness.ts
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HARNESS_FILE = path.join(PROJECT_ROOT, 'src/main/engine/agent-harness.ts');
const LOG_FILE = path.join(PROJECT_ROOT, 'ai/data/trainer/harness_evolution.jsonl');
const TEST_MODEL = 'mistralai/devstral-small-2-2512';

// Ensure log directory exists
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

interface TestCase {
  prompt: string;
  expectedTools: string[];
  assertions: string[];
}

const TEST_CASES: TestCase[] = [
  {
    prompt: 'Navigate the browser to https://example.com and read the page title.',
    expectedTools: ['browser_navigate', 'browser_read_page'],
    assertions: [
      'agent called browser_navigate',
      'agent called browser_read_page',
      'response mentions "Example Domain"',
    ],
  },
  {
    prompt: 'Search the web for "latest AI news" and tell me the top 3 results.',
    expectedTools: ['web_search'],
    assertions: [
      'agent called web_search',
      'response contains numbered results or bullet points',
      'response does NOT say "I cannot access the web"',
    ],
  },
  {
    prompt: 'Open https://news.ycombinator.com in the browser and tell me the #1 story.',
    expectedTools: ['browser_navigate', 'browser_read_page'],
    assertions: [
      'agent called browser_navigate',
      'agent called browser_read_page',
      'response length is at least 50 characters',
      'response does NOT say "I cannot browse"',
    ],
  },
  {
    prompt: 'Write a Python function that calculates fibonacci(n) and run it with n=10.',
    expectedTools: ['sandbox'],
    assertions: [
      'agent called sandbox',
      'response contains the number 55',
      'response shows code output',
    ],
  },
  {
    prompt: 'Fetch the content from https://httpbin.org/json and summarize it.',
    expectedTools: ['web_fetch'],
    assertions: [
      'agent called web_fetch',
      'response discusses the fetched content',
      'response does NOT say "I cannot access URLs"',
    ],
  },
];

let app: ElectronApplication;
let page: Page;

async function launchApp(): Promise<void> {
  // Build first
  const { execSync } = require('child_process');
  console.log('Building...');
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' });

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

  // Ensure endpoint exists
  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
    }
  });
}

async function closeApp(): Promise<void> {
  if (app) await app.close();
}

interface TestResult {
  toolsCalled: string[];
  responseText: string;
  conversationId: string | null;
  error: string | null;
}

async function runAgentTest(prompt: string, timeoutMs = 45_000): Promise<TestResult> {
  const result = await page.evaluate(async ({ prompt, model, timeout }: any) => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) return { toolsCalled: [], responseText: '', conversationId: null, error: 'No endpoints' };

    const endpointId = eps[0].id;

    // Collect events
    const events: any[] = [];
    let done = false;

    const { conversationId } = await (window as any).liteBench.agent.send({
      endpointId,
      modelId: model,
      messages: [{ id: '1', role: 'user', content: prompt, timestamp: Date.now() }],
      enableTools: true,
    });

    // Subscribe to events
    const unsub = (window as any).liteBench.agent.onStreamEvent(conversationId, (event: any) => {
      events.push(event);
      if (event.type === 'done' || event.type === 'error') {
        done = true;
      }
    });

    // Wait for completion
    const start = Date.now();
    while (!done && Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 200));
    }
    unsub();

    // Extract results
    const toolsCalled = events
      .filter(e => e.type === 'tool_call_start')
      .map(e => e.toolCall?.name || 'unknown');

    const textContent = events
      .filter(e => e.type === 'text_delta')
      .map(e => e.content)
      .join('');

    const errorEvent = events.find(e => e.type === 'error');

    return {
      toolsCalled,
      responseText: textContent,
      conversationId,
      error: errorEvent?.message || null,
    };
  }, { prompt, model: TEST_MODEL, timeout: timeoutMs });

  return result;
}

function evaluateResult(test: TestCase, result: TestResult): { score: number; details: string[] } {
  const details: string[] = [];
  let passed = 0;
  const total = test.assertions.length;

  for (const assertion of test.assertions) {
    const lower = assertion.toLowerCase();
    let pass = false;

    if (lower.includes('agent called')) {
      const toolName = assertion.match(/called (\w+)/)?.[1] || '';
      pass = result.toolsCalled.includes(toolName);
    } else if (lower.includes('response length is at least')) {
      const minLen = parseInt(assertion.match(/at least (\d+)/)?.[1] || '10');
      pass = result.responseText.length >= minLen;
    } else if (lower.includes('does not say') || lower.includes('does not contain')) {
      const phrase = assertion.match(/"(.+?)"/)?.[1] || '';
      pass = !result.responseText.toLowerCase().includes(phrase.toLowerCase());
    } else if (lower.includes('contains') || lower.includes('mentions')) {
      const phrase = assertion.match(/"(.+?)"/)?.[1] || assertion.split(' ').slice(-2).join(' ');
      pass = result.responseText.toLowerCase().includes(phrase.toLowerCase());
    } else if (lower.includes('response contains')) {
      pass = result.responseText.length > 20;
    } else {
      pass = result.responseText.length > 10;
    }

    if (pass) {
      passed++;
      details.push(`  ✅ ${assertion}`);
    } else {
      details.push(`  ❌ ${assertion}`);
    }
  }

  return { score: (passed / total) * 100, details };
}

async function runFullEvaluation(): Promise<{ avgScore: number; perTest: { test: TestCase; score: number; details: string[]; toolsCalled: string[] }[] }> {
  const results: { test: TestCase; score: number; details: string[]; toolsCalled: string[] }[] = [];

  for (const test of TEST_CASES) {
    console.log(`  Testing: "${test.prompt.slice(0, 60)}..."`);
    const result = await runAgentTest(test.prompt);
    const { score, details } = evaluateResult(test, result);
    results.push({ test, score, details, toolsCalled: result.toolsCalled });

    console.log(`    Tools called: [${result.toolsCalled.join(', ')}]`);
    console.log(`    Score: ${score.toFixed(0)}%`);
    console.log(`    Response length: ${result.responseText.length} chars`);
    console.log(`    Response preview: "${result.responseText.slice(0, 200).replace(/\n/g, ' ')}"`);
    for (const d of details) console.log(`    ${d}`);
    console.log();
  }

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  return { avgScore, perTest: results };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  HARNESS TRAINING LOOP — LiteBench Agent System        ║');
  console.log('║  Model: Devstral Small 2 (via LM Studio)               ║');
  console.log('║  Target: agent-harness.ts system prompts               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // ── STEP 1: Launch + Baseline ────────────────────
  console.log('=== BASELINE EVALUATION ===\n');
  await launchApp();

  // Open browser panel first (agent needs it)
  const browserBtn = page.locator('button[title="Browser"]');
  if (await browserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await browserBtn.click();
    await page.waitForTimeout(1000);
  }

  const baseline = await runFullEvaluation();
  console.log(`\n=== BASELINE SCORE: ${baseline.avgScore.toFixed(1)}% ===\n`);

  // Identify failures
  const failures = baseline.perTest.filter(r => r.score < 100);
  const toolFailures = baseline.perTest.filter(r => {
    const expectedTools = r.test.expectedTools;
    return expectedTools.some(t => !r.toolsCalled.includes(t));
  });

  console.log(`Tests passed fully: ${baseline.perTest.filter(r => r.score === 100).length}/${TEST_CASES.length}`);
  console.log(`Tests with missing tool calls: ${toolFailures.length}`);
  console.log();

  if (toolFailures.length > 0) {
    console.log('Missing tool calls:');
    for (const f of toolFailures) {
      const missing = f.test.expectedTools.filter(t => !f.toolsCalled.includes(t));
      console.log(`  "${f.test.prompt.slice(0, 50)}..." — missing: [${missing.join(', ')}], got: [${f.toolsCalled.join(', ')}]`);
    }
  }

  // Log baseline
  const logEntry = {
    cycle: 0,
    type: 'baseline',
    timestamp: new Date().toISOString(),
    model: TEST_MODEL,
    avgScore: baseline.avgScore,
    perTest: baseline.perTest.map(r => ({
      prompt: r.test.prompt.slice(0, 80),
      score: r.score,
      toolsCalled: r.toolsCalled,
      expectedTools: r.test.expectedTools,
    })),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  console.log(`\nBaseline logged to ${LOG_FILE}`);
  console.log('Review the results above. The training loop will now mutate the system prompt');
  console.log('in agent-harness.ts to improve tool-calling reliability.\n');

  await closeApp();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
