/**
 * ChatGPT Image Generation Test — connects to the RUNNING LiteBench app via CDP.
 *
 * Does NOT launch a new app. Requires the app to be running with
 * --remote-debugging-port=9222 (built into the main process).
 *
 * Run: npx tsx e2e/chatgpt-image-gen.ts
 *      npx tsx e2e/chatgpt-image-gen.ts --model "qwen/qwen3.6-27b"
 *      npx tsx e2e/chatgpt-image-gen.ts --prompt "sunset over mountains"
 */
import { chromium, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'ai/data/trainer/harness_evolution.jsonl');
const SS_DIR = path.join(PROJECT_ROOT, 'e2e/screenshots/chatgpt-image-gen');

const cliArgs = process.argv.slice(2);

function getFlag(name: string, fallback: string): string {
  const idx = cliArgs.indexOf(`--${name}`);
  return idx >= 0 && cliArgs[idx + 1] ? cliArgs[idx + 1] : fallback;
}

const TEST_MODEL = getFlag('model', 'qwen/qwen3.6-27b');
const IMAGE_PROMPT = getFlag('prompt', 'a cyberpunk dragon flying over a neon-lit city at night');
const CDP_PORT = getFlag('port', '9222');

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
fs.mkdirSync(SS_DIR, { recursive: true });

// ── Connect to Running App ────────────────────────────────────────────────────

async function connectToApp(): Promise<Page> {
  console.log(`Connecting to LiteBench via CDP on port ${CDP_PORT}...`);
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error('No browser contexts found — is LiteBench running?');

  // Find the main window page (not DevTools or browser views)
  let appPage: Page | null = null;
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      const url = page.url();
      // Main renderer page loads from file:// or localhost dev server
      if (url.includes('index.html') || url.includes('localhost:') || url.startsWith('file://')) {
        appPage = page;
        break;
      }
    }
    if (appPage) break;
  }

  if (!appPage) {
    // Fallback: use the first page
    appPage = contexts[0].pages()[0];
  }

  if (!appPage) throw new Error('No pages found in LiteBench — is the app window open?');
  console.log(`Connected to: ${appPage.url().substring(0, 80)}`);
  return appPage;
}

// ── Model Selection ───────────────────────────────────────────────────────────

async function setModel(page: Page, modelId: string): Promise<void> {
  await page.evaluate(async ({ modelId }: any) => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) return;
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
  // Soft-reload the agent chat state without full page reload
  console.log(`Model set to: ${modelId}`);
}

// ── Chat Interaction ──────────────────────────────────────────────────────────

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  // Target the Agent Chat textarea specifically (not xterm's hidden textarea)
  const textarea = page.locator('textarea[placeholder*="Ask the agent"]');
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });
  await textarea.fill('');
  await page.waitForTimeout(100);
  await textarea.fill(prompt);
  await page.waitForTimeout(200);
  await textarea.press('Enter');
}

async function waitForCompletion(page: Page, timeoutMs = 180_000): Promise<{
  toolsCalled: string[];
  responseText: string;
  error: string | null;
}> {
  return page.evaluate(async ({ timeout }: any) => {
    await new Promise(r => setTimeout(r, 500));
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, 1000));
      const raw = localStorage.getItem('litebench-agent-chat');
      if (!raw) continue;

      const store = JSON.parse(raw);
      const convs = store.state?.conversations || [];
      const activeId = store.state?.activeConversationId;
      const conv = convs.find((c: any) => c.id === activeId);
      if (!conv) continue;

      const messages = conv.messages || [];
      const allToolCalls: string[] = [];
      let lastAssistantText = '';

      for (const msg of messages) {
        if (msg.role === 'assistant') {
          const tcs = (msg.toolCalls || []).map((tc: any) => tc.name);
          allToolCalls.push(...tcs);
          lastAssistantText = msg.content || '';
        }
      }

      // Check if the last assistant message is done streaming
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming && allToolCalls.length > 0) {
        return { toolsCalled: allToolCalls, responseText: lastAssistantText, error: null };
      }
    }

    return { toolsCalled: [], responseText: '', error: 'Timed out waiting for agent response' };
  }, { timeout: timeoutMs });
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function evaluate(toolsCalled: string[], responseText: string): {
  score: number; passed: number; total: number;
  details: Array<{ label: string; pass: boolean }>;
} {
  const expected = ['browser_go', 'browser_elements', 'browser_type', 'browser_click'];
  const details: Array<{ label: string; pass: boolean }> = [];

  details.push({ label: 'browser_go called', pass: toolsCalled.includes('browser_go') });
  details.push({ label: 'browser_elements called', pass: toolsCalled.includes('browser_elements') });
  details.push({ label: 'browser_type called', pass: toolsCalled.includes('browser_type') });
  details.push({ label: 'browser_click called', pass: toolsCalled.includes('browser_click') });

  const filtered = toolsCalled.filter(t => expected.includes(t));
  details.push({ label: 'correct tool sequence', pass: JSON.stringify(filtered) === JSON.stringify(expected) });

  const lower = responseText.toLowerCase();
  details.push({ label: 'no refusal', pass: !lower.includes('i cannot') && !lower.includes("i'm unable") });

  const passed = details.filter(d => d.pass).length;
  return { score: (passed / details.length) * 100, passed, total: details.length, details };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ChatGPT Image Gen — Live App Test (CDP)                  ║');
  console.log(`║  Model:  ${TEST_MODEL.padEnd(47)}║`);
  console.log(`║  Prompt: ${IMAGE_PROMPT.substring(0, 47).padEnd(47)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const page = await connectToApp();
  await page.screenshot({ path: path.join(SS_DIR, 'connected.png') });

  // Set model
  console.log(`Setting model to ${TEST_MODEL}...`);
  await setModel(page, TEST_MODEL);

  // Open Browser panel first (agent needs it for browser tools)
  console.log('Opening Browser panel...');
  await page.locator('button[title="Browser"]').click();
  await page.waitForTimeout(1500);

  // Open Agent Chat panel
  console.log('Opening Agent Chat panel...');
  await page.locator('button[title="Agent Chat"]').click();
  await page.waitForTimeout(2000);

  // Wait for the Agent Chat textarea to appear
  const chatTextarea = page.locator('textarea[placeholder*="Ask the agent"]');
  try {
    await chatTextarea.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('Agent Chat textarea found.');
  } catch {
    // Fallback: try any textarea that's NOT xterm's (xterm textarea has no placeholder)
    console.log('Primary selector failed, trying fallback...');
    const allTextareas = await page.locator('textarea').all();
    for (let i = 0; i < allTextareas.length; i++) {
      const ph = await allTextareas[i].getAttribute('placeholder');
      console.log(`  textarea ${i}: placeholder="${ph}"`);
    }
    throw new Error('Agent Chat textarea not found — is the panel open?');
  }

  // New conversation for clean slate
  const newBtn = page.locator('button[title="New conversation"]');
  if (await newBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(500);
  }

  // Build and send the prompt
  const agentPrompt = [
    `Go to https://chatgpt.com. Once the page loads, use browser_elements to find the message input area and the send button.`,
    `Then use browser_type to type this prompt: "Generate an image: ${IMAGE_PROMPT}".`,
    `Finally, use browser_click to click the send button.`,
    `Tell me what happened after you clicked send.`,
  ].join(' ');

  console.log(`\nSending prompt: "${agentPrompt.substring(0, 100)}..."`);
  const startTime = Date.now();
  await sendPrompt(page, agentPrompt);

  console.log('Waiting for agent to complete (watch the app)...\n');
  await page.screenshot({ path: path.join(SS_DIR, 'prompt-sent.png') });

  const result = await waitForCompletion(page, 180_000);
  const elapsedMs = Date.now() - startTime;

  await page.screenshot({ path: path.join(SS_DIR, 'final.png') });

  const { score, passed, total, details } = evaluate(result.toolsCalled, result.responseText);

  console.log('=== RESULTS ===\n');
  console.log(`  Model:     ${TEST_MODEL}`);
  console.log(`  Tools:     [${result.toolsCalled.join(' -> ') || 'none'}]`);
  console.log(`  Score:     ${score.toFixed(0)}% (${passed}/${total})`);
  console.log(`  Time:      ${(elapsedMs / 1000).toFixed(1)}s`);
  if (result.error) console.log(`  Error:     ${result.error}`);
  console.log();

  for (const d of details) {
    console.log(`  ${d.pass ? 'PASS' : 'FAIL'} ${d.label}`);
  }

  if (result.responseText) {
    const preview = result.responseText.substring(0, 200).replace(/\n/g, ' ');
    console.log(`\n  Response: "${preview}${preview.length >= 200 ? '...' : ''}"`);
  }

  // Log results
  const logEntry = {
    cycle: 'eval',
    type: 'chatgpt-image-gen-live',
    timestamp: new Date().toISOString(),
    model: TEST_MODEL,
    imagePrompt: IMAGE_PROMPT,
    avgScore: score,
    perfectCount: passed === total ? 1 : 0,
    totalTests: 1,
    perTest: [{
      prompt: agentPrompt.substring(0, 120),
      score,
      toolsCalled: result.toolsCalled,
      expectedTools: ['browser_go', 'browser_elements', 'browser_type', 'browser_click'],
      elapsed: elapsedMs,
    }],
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

  console.log(`\n${'='.repeat(59)}`);
  console.log(`  SCORE: ${score.toFixed(0)}% (${passed}/${total}) | TIME: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  TOOLS: ${result.toolsCalled.join(' -> ')}`);
  console.log(`${'='.repeat(59)}`);
  console.log(`\nScreenshots: ${SS_DIR}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
