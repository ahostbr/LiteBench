/**
 * Harness Training — Drives the REAL Agent Chat UI.
 *
 * Orchestration:
 * 1. Opens Browser panel + Agent panel
 * 2. Selects model via the UI dropdown
 * 3. Types prompts into the actual chat textarea, presses Enter
 * 4. Tool calls and messages appear in the chat panel in real time
 * 5. Watches the DOM for completion, extracts results
 *
 * You can WATCH everything happening live — browser navigating, tool cards
 * appearing, streaming text in the chat.
 *
 * Run: npx tsx e2e/train-harness.ts [--model <modelId>]
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'ai/data/trainer/harness_evolution.jsonl');

const args = process.argv.slice(2);
const modelFlag = args.indexOf('--model');
const TEST_MODEL = modelFlag >= 0 && args[modelFlag + 1]
  ? args[modelFlag + 1]
  : 'mistralai/devstral-small-2-2512';

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

interface TestCase {
  prompt: string;
  expectedTools: string[];
  assertions: string[];
}

const TEST_CASES: TestCase[] = [
  {
    prompt: 'Navigate the browser to https://example.com and read the page content.',
    expectedTools: ['browser_navigate', 'browser_read_page'],
    assertions: [
      'agent called browser_navigate',
      'agent called browser_read_page',
      'response mentions "Example Domain"',
    ],
  },
  {
    prompt: 'Search the web for "artificial intelligence breakthroughs 2026" and list the top 3 results as a numbered list.',
    expectedTools: ['web_search'],
    assertions: [
      'agent called web_search',
      'response contains numbered results or bullet points',
      'response does NOT say "I cannot access the web"',
    ],
  },
  {
    prompt: 'Open https://news.ycombinator.com in the browser and tell me the #1 story title.',
    expectedTools: ['browser_navigate', 'browser_read_page'],
    assertions: [
      'agent called browser_navigate',
      'agent called browser_read_page',
      'response length is at least 50 characters',
      'response does NOT say "I cannot browse"',
    ],
  },
  {
    prompt: 'Use the sandbox to run this Python code and tell me the output: print(sum(range(1, 11)))',
    expectedTools: ['sandbox'],
    assertions: [
      'agent called sandbox',
      'response contains the number 55',
      'response shows code output',
    ],
  },
  {
    prompt: 'Fetch the content from https://httpbin.org/json and summarize what it contains.',
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

// ── App Lifecycle ─────────────────────────────────────────────────────────────

async function launchApp(): Promise<void> {
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
  await page.waitForTimeout(2000);

  // Ensure LM Studio endpoint exists
  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
    }
  });
}

async function openPanel(title: string): Promise<void> {
  const btn = page.locator(`button[title="${title}"]`);
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(800);
  }
}

// ── Model Selection ───────────────────────────────────────────────────────────

async function setModelViaStore(modelId: string): Promise<void> {
  // Set model + endpoint directly in the Zustand store
  await page.evaluate(async ({ modelId }: any) => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) return;

    // Update localStorage-persisted Zustand store
    const raw = localStorage.getItem('litebench-agent-chat');
    if (raw) {
      const store = JSON.parse(raw);
      if (store.state) {
        store.state.selectedModelId = modelId;
        store.state.selectedEndpointId = eps[0].id;
        store.state.enableTools = true;
        localStorage.setItem('litebench-agent-chat', JSON.stringify(store));
      }
    }
  }, { modelId });

  // Reload to pick up store changes
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length! > 0,
    undefined, { timeout: 15_000 },
  );
  await page.waitForTimeout(1500);
}

// ── Chat Interaction (through real UI) ────────────────────────────────────────

async function typeAndSend(prompt: string): Promise<void> {
  // Find the chat textarea — try multiple selectors
  let textarea = page.locator('textarea').first();
  const visible = await textarea.isVisible().catch(() => false);
  if (!visible) {
    // Debug: list all textareas and inputs
    const count = await page.locator('textarea').count();
    console.log(`    DEBUG: ${count} textareas found on page`);
    const html = await page.evaluate(() => document.body?.innerHTML.substring(0, 500) || 'no body');
    console.log(`    DEBUG: body preview: ${html.substring(0, 200)}`);
    // Try waiting longer
    await page.waitForTimeout(2000);
    textarea = page.locator('textarea').first();
  }
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });

  // Clear any existing text
  await textarea.fill('');
  await page.waitForTimeout(100);

  // Type the prompt
  await textarea.fill(prompt);
  await page.waitForTimeout(200);

  // Press Enter to send
  await textarea.press('Enter');
}

/**
 * Wait for the agent to finish by monitoring IPC events.
 * Simultaneously, the UI updates because handleSend subscribes to the same events.
 */
async function waitForResponse(timeoutMs = 90_000): Promise<{
  toolsCalled: string[];
  responseText: string;
  error: string | null;
}> {
  // Use a hybrid: IPC bridge for accurate event tracking,
  // while the UI shows everything via its own handleSend subscription
  const result = await page.evaluate(async ({ model, timeout }: any) => {
    // Wait briefly for the send to complete and IPC events to start flowing
    await new Promise(r => setTimeout(r, 300));

    // Poll the Zustand store for the latest assistant message
    // The UI's handleSend already set up the event listener, so events flow to the store
    const startTime = Date.now();
    let lastMessageCount = 0;
    let stableCount = 0;

    while (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, 500));

      // Read current state from localStorage (Zustand persist)
      const raw = localStorage.getItem('litebench-agent-chat');
      if (!raw) continue;

      const store = JSON.parse(raw);
      const convs = store.state?.conversations || [];
      const activeId = store.state?.activeConversationId;
      const conv = convs.find((c: any) => c.id === activeId);
      if (!conv) continue;

      const messages = conv.messages || [];
      const lastMsg = messages[messages.length - 1];

      // Check if we have an assistant message that's not streaming
      if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming) {
        // Found a complete response
        const toolNames = (lastMsg.toolCalls || []).map((tc: any) => tc.name);
        return {
          toolsCalled: toolNames,
          responseText: lastMsg.content || '',
          error: null,
        };
      }

      // Check for tool calls on a streaming message
      if (lastMsg && lastMsg.isStreaming) {
        // Still streaming — keep waiting
        stableCount = 0;
      }
    }

    return { toolsCalled: [], responseText: '', error: 'Timed out waiting for response' };
  }, { model: TEST_MODEL, timeout: timeoutMs });

  return result;
}

/**
 * Alternative: collect events directly via IPC (more reliable for tool tracking)
 * while the UI shows everything through its own subscription.
 */
async function runTestViaIPC(prompt: string, timeoutMs = 90_000): Promise<{
  toolsCalled: string[];
  responseText: string;
  error: string | null;
}> {
  return page.evaluate(async ({ prompt, model, timeout }: any) => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) return { toolsCalled: [], responseText: '', error: 'No endpoints' };

    const events: any[] = [];
    let done = false;

    const { conversationId } = await (window as any).liteBench.agent.send({
      endpointId: eps[0].id,
      modelId: model,
      messages: [{ id: `test-${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() }],
      enableTools: true,
    });

    const unsub = (window as any).liteBench.agent.onStreamEvent(conversationId, (event: any) => {
      events.push(event);
      if (event.type === 'done' || event.type === 'error') done = true;
    });

    const start = Date.now();
    while (!done && Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 200));
    }
    unsub();

    return {
      toolsCalled: events.filter(e => e.type === 'tool_call_start').map(e => e.toolCall?.name || '?'),
      responseText: events.filter(e => e.type === 'text_delta').map(e => e.content).join(''),
      error: events.find(e => e.type === 'error')?.message || null,
    };
  }, { prompt, model: TEST_MODEL, timeout: timeoutMs });
}

// ── Test: send via UI, track via IPC ──────────────────────────────────────────

async function runTest(prompt: string, timeoutMs = 90_000): Promise<{
  toolsCalled: string[];
  responseText: string;
  error: string | null;
  elapsedMs: number;
}> {
  const startTime = Date.now();

  // Type into the real chat textarea and press Enter
  await typeAndSend(prompt);

  // Collect results via IPC (the UI is already showing everything from its own subscription)
  // Small delay for the send handler to fire
  await page.waitForTimeout(300);

  // Actually we need to track events from the IPC since the UI send already happened.
  // The problem: typeAndSend triggers handleSend which calls api.agent.send and subscribes.
  // We can't also subscribe (double subscription).
  // Instead: poll the DOM/store for the final result.

  const result = await waitForResponse(timeoutMs);

  return {
    ...result,
    elapsedMs: Date.now() - startTime,
  };
}

// ── Assertion Evaluation ──────────────────────────────────────────────────────

function evaluateResult(test: TestCase, result: { toolsCalled: string[]; responseText: string; error: string | null }): {
  score: number; passed: number; total: number; details: string[];
} {
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
    } else if (lower.includes('contains the number')) {
      const num = assertion.match(/number (\d+)/)?.[1] || '';
      pass = result.responseText.includes(num);
    } else if (lower.includes('mentions')) {
      const phrase = assertion.match(/"(.+?)"/)?.[1] || '';
      pass = result.responseText.toLowerCase().includes(phrase.toLowerCase());
    } else if (lower.includes('contains numbered results') || lower.includes('bullet points')) {
      pass = /\d\.\s/.test(result.responseText) || /[-•*]\s/.test(result.responseText);
    } else if (lower.includes('discusses') || lower.includes('shows')) {
      pass = result.responseText.length > 30;
    } else {
      pass = result.responseText.length > 10;
    }

    details.push(pass ? `  ✅ ${assertion}` : `  ❌ ${assertion}`);
    if (pass) passed++;
  }

  return { score: (passed / total) * 100, passed, total, details };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  LiteBench Harness Training — Live UI                     ║');
  console.log(`║  Model: ${TEST_MODEL.padEnd(48)}║`);
  console.log('║  Watch the app — everything happens in the real panels!   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  await launchApp();

  // Set model in store (this reloads the page)
  console.log(`🔧 Setting model: ${TEST_MODEL}`);
  await setModelViaStore(TEST_MODEL);

  // Open Browser panel (agent needs it for browser tools)
  console.log('📺 Opening Browser panel...');
  await openPanel('Browser');
  await page.waitForTimeout(1500);

  // Open Agent Chat panel
  console.log('💬 Opening Agent Chat panel...');
  await openPanel('Agent Chat');
  await page.waitForTimeout(1000);

  const ssDir = path.join(PROJECT_ROOT, 'e2e/screenshots');
  fs.mkdirSync(ssDir, { recursive: true });
  await page.screenshot({ path: path.join(ssDir, 'train-initial.png') });
  console.log('📸 Initial state captured\n');

  // ── Run Tests ──────────────────────────────
  console.log(`=== EVALUATION (${TEST_CASES.length} tests) ===\n`);

  const results: {
    test: TestCase; score: number; passed: number; total: number;
    details: string[]; toolsCalled: string[]; elapsed: number; responsePreview: string;
  }[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const test = TEST_CASES[i];
    console.log(`[${i + 1}/${TEST_CASES.length}] "${test.prompt.substring(0, 65)}..."`);
    console.log(`    ⏳ Sending via chat UI — watch the app...`);

    const result = await runTest(test.prompt, 90_000);
    const { score, passed, total, details } = evaluateResult(test, result);

    const preview = result.responseText.substring(0, 200).replace(/\n/g, ' ');
    results.push({
      test, score, passed, total, details,
      toolsCalled: result.toolsCalled,
      elapsed: result.elapsedMs,
      responsePreview: preview,
    });

    console.log(`    Tools:    [${result.toolsCalled.join(', ') || 'none'}]`);
    console.log(`    Score:    ${score.toFixed(0)}% (${passed}/${total})`);
    console.log(`    Time:     ${(result.elapsedMs / 1000).toFixed(1)}s`);
    console.log(`    Response: "${preview.substring(0, 120)}${preview.length > 120 ? '...' : ''}"`);
    if (result.error) console.log(`    Error:    ${result.error}`);
    for (const d of details) console.log(`  ${d}`);

    await page.screenshot({ path: path.join(ssDir, `train-test-${i + 1}.png`) });
    console.log(`    📸 Screenshot saved\n`);

    // Create new conversation for next test (clean slate)
    if (i < TEST_CASES.length - 1) {
      // Click the "new conversation" button (RotateCcw icon)
      const newBtn = page.locator('button[title="New conversation"]');
      if (await newBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await newBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // ── Summary ──────────────────────────────
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  const perfect = results.filter(r => r.score === 100).length;
  const toolFailures = results.filter(r =>
    r.test.expectedTools.some(t => !r.toolsCalled.includes(t)),
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  MODEL:       ${TEST_MODEL}`);
  console.log(`  AVG SCORE:   ${avgScore.toFixed(1)}%`);
  console.log(`  PERFECT:     ${perfect}/${TEST_CASES.length} tests`);
  console.log(`  TOOL MISSES: ${toolFailures.length} tests with missing tool calls`);
  console.log('═══════════════════════════════════════════════════════════');

  if (toolFailures.length > 0) {
    console.log('\nMissing tool calls:');
    for (const f of toolFailures) {
      const missing = f.test.expectedTools.filter(t => !f.toolsCalled.includes(t));
      console.log(`  "${f.test.prompt.substring(0, 50)}..." — missing: [${missing.join(', ')}], got: [${f.toolsCalled.join(', ')}]`);
    }
  }

  const logEntry = {
    cycle: 'eval',
    type: 'ui-driven-evaluation',
    timestamp: new Date().toISOString(),
    model: TEST_MODEL,
    avgScore,
    perfectCount: perfect,
    totalTests: TEST_CASES.length,
    perTest: results.map(r => ({
      prompt: r.test.prompt.substring(0, 80),
      score: r.score,
      toolsCalled: r.toolsCalled,
      expectedTools: r.test.expectedTools,
      elapsed: r.elapsed,
    })),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  await page.screenshot({ path: path.join(ssDir, 'train-final.png') });
  console.log('\n📸 Final state captured');
  console.log(`📝 Results logged to ${LOG_FILE}`);

  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
