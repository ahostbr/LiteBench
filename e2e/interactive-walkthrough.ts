/**
 * Interactive walkthrough script — NOT a test file.
 * Run with: npx tsx e2e/interactive-walkthrough.ts
 *
 * Launches the Electron app and provides step-by-step functions
 * that can be called to walk through the app interactively.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SS_DIR = path.join(__dirname, 'screenshots', 'walkthrough');
fs.mkdirSync(SS_DIR, { recursive: true });

let app: ElectronApplication;
let page: Page;
let shotCounter = 0;

async function shot(label: string): Promise<string> {
  shotCounter++;
  const name = `${String(shotCounter).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: path.join(SS_DIR, name), fullPage: false });
  console.log(`📸 ${name}`);
  return path.join(SS_DIR, name);
}

async function openPanel(title: string) {
  const btn = page.locator(`button[title="${title}"]`);
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(500);
  }
}

async function main() {
  // ── LAUNCH ──────────────────────────────────────────
  console.log('Launching LiteBench...');
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
  console.log('App ready.\n');

  // ── STEP 1: Dashboard ──────────────────────────────
  console.log('=== STEP 1: Dashboard ===');
  await shot('dashboard');

  // ── STEP 2: Create endpoint if needed ──────────────
  console.log('\n=== STEP 2: Ensure LM Studio endpoint exists ===');
  const epCount = await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
      return 1;
    }
    return eps.length;
  });
  console.log(`  Endpoints: ${epCount}`);

  // ── STEP 3: Seed suites ────────────────────────────
  console.log('\n=== STEP 3: Seed suites ===');
  await page.evaluate(async () => {
    try { await (window as any).liteBench.suites.seedDefaults(); } catch {}
    try { await (window as any).liteBench.suites.seedAgent(); } catch {}
    try { await (window as any).liteBench.suites.seedCreator(); } catch {}
  });
  const suiteCount = await page.evaluate(async () => {
    const s = await (window as any).liteBench.suites.list();
    return s.length;
  });
  console.log(`  Suites seeded: ${suiteCount}`);

  // ── STEP 4: Open Agent Chat ────────────────────────
  console.log('\n=== STEP 4: Open Agent Chat ===');
  await openPanel('Agent Chat');
  await page.waitForTimeout(2000);
  await shot('agent-chat-empty');

  // ── STEP 5: Check model selector ───────────────────
  console.log('\n=== STEP 5: Check model selector ===');
  // The ModelSelector should now show LM Studio endpoint and real models
  const selectElements = await page.locator('select').all();
  console.log(`  Select elements found: ${selectElements.length}`);
  for (let i = 0; i < selectElements.length; i++) {
    const opts = await selectElements[i].locator('option').allTextContents();
    console.log(`  Select ${i}: ${opts.slice(0, 5).join(', ')}${opts.length > 5 ? '...' : ''}`);
  }
  await shot('agent-chat-selectors');

  // ── STEP 6: Select a model ─────────────────────────
  console.log('\n=== STEP 6: Select model ===');
  // Find the model select and pick devstral (good at tool calling)
  const modelSelect = page.locator('select').nth(1); // second select is model
  if (await modelSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    const modelOptions = await modelSelect.locator('option').allTextContents();
    console.log(`  Available models: ${modelOptions.join(', ')}`);

    // Pick devstral if available, otherwise first real model
    const devstral = modelOptions.find(m => m.includes('devstral'));
    const target = devstral || modelOptions.find(m => m !== 'Select model' && m !== 'No models');
    if (target) {
      await modelSelect.selectOption({ label: target });
      console.log(`  Selected: ${target}`);
    }
  }
  await page.waitForTimeout(500);
  await shot('agent-chat-model-selected');

  // ── STEP 7: Send a simple message ──────────────────
  console.log('\n=== STEP 7: Send "Hello" ===');
  const textarea = page.locator('textarea').first();

  // Force enable if disabled
  await page.evaluate(() => {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) { ta.disabled = false; ta.removeAttribute('disabled'); }
  });

  await textarea.click({ force: true });
  await page.keyboard.type('Hello! What can you help me with?', { delay: 10 });
  await shot('agent-chat-typed');

  await page.keyboard.press('Enter');
  console.log('  Message sent, waiting for response...');

  // Wait and screenshot at intervals
  await page.waitForTimeout(3000);
  await shot('agent-chat-3s');

  await page.waitForTimeout(5000);
  await shot('agent-chat-8s');

  await page.waitForTimeout(7000);
  await shot('agent-chat-15s');

  // Check if any response appeared
  const messageCount = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[class*="message"], [class*="bubble"]');
    return msgs.length;
  });
  console.log(`  Message elements in DOM: ${messageCount}`);

  // Check the page text for response content
  const bodyText = await page.evaluate(() => document.body.innerText.slice(-500));
  console.log(`  Last 500 chars of page: ${bodyText.slice(0, 200)}...`);

  await shot('agent-chat-response');

  // ── STEP 8: Check if streaming worked ──────────────
  console.log('\n=== STEP 8: Verify streaming ===');

  // Check localStorage for conversation state
  const storeState = await page.evaluate(() => {
    const raw = localStorage.getItem('litebench-agent-chat');
    if (!raw) return { found: false };
    const parsed = JSON.parse(raw);
    const convs = parsed?.state?.conversations || [];
    return {
      found: true,
      conversationCount: convs.length,
      activeId: parsed?.state?.activeConversationId,
      selectedEndpointId: parsed?.state?.selectedEndpointId,
      selectedModelId: parsed?.state?.selectedModelId,
      messageCount: convs[0]?.messages?.length || 0,
      lastMessage: convs[0]?.messages?.slice(-1)[0]?.content?.slice(0, 100) || 'none',
    };
  });
  console.log('  Store state:', JSON.stringify(storeState, null, 2));

  // ── STEP 9: Test tool call ─────────────────────────
  console.log('\n=== STEP 9: Test web search tool call ===');

  await page.evaluate(() => {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) { ta.disabled = false; ta.removeAttribute('disabled'); }
  });
  await textarea.click({ force: true });
  await page.keyboard.type('Search the web for "AI benchmarks 2026"', { delay: 10 });
  await shot('agent-chat-search-typed');

  await page.keyboard.press('Enter');
  console.log('  Search message sent, waiting for tool call...');

  await page.waitForTimeout(5000);
  await shot('agent-chat-search-5s');

  await page.waitForTimeout(10000);
  await shot('agent-chat-search-15s');

  await page.waitForTimeout(15000);
  await shot('agent-chat-search-30s');

  // ── STEP 10: Open Browser panel ────────────────────
  console.log('\n=== STEP 10: Browser panel ===');
  await openPanel('Browser');
  await page.waitForTimeout(1000);
  await shot('browser-empty');

  const urlInput = page.locator('input[type="url"], input[placeholder*="url" i], input[placeholder*="http" i]').first();
  if (await urlInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await urlInput.fill('https://example.com');
    await urlInput.press('Enter');
    await page.waitForTimeout(3000);
    await shot('browser-example-com');
  }

  // ── STEP 11: Agent Benchmark panel ─────────────────
  console.log('\n=== STEP 11: Agent Benchmark panel ===');
  await openPanel('Agent Benchmark');
  await page.waitForTimeout(1000);
  await shot('agent-benchmark');

  // Check if agent suites are available
  const benchState = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    const texts: string[] = [];
    selects.forEach(s => {
      const opts = Array.from(s.options).map(o => o.text);
      texts.push(opts.join(', '));
    });
    return texts;
  });
  console.log('  Benchmark selects:', benchState);

  // ── STEP 12: Test Suites panel ─────────────────────
  console.log('\n=== STEP 12: Test Suites ===');
  await openPanel('Test Suites');
  await page.waitForTimeout(1000);
  await shot('test-suites');

  // ── STEP 13: Final overview ────────────────────────
  console.log('\n=== STEP 13: All panels ===');
  // Open all panels for a final view
  for (const p of ['Dashboard', 'Agent Chat', 'Browser', 'Agent Benchmark']) {
    await openPanel(p);
    await page.waitForTimeout(200);
  }
  // Switch to Agent Chat as active
  await openPanel('Agent Chat');
  await page.waitForTimeout(500);
  await shot('final-agent-chat');

  // ── DONE ───────────────────────────────────────────
  console.log('\n=== DONE ===');
  console.log(`Screenshots saved to: ${SS_DIR}`);
  console.log(`Total screenshots: ${shotCounter}`);

  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
