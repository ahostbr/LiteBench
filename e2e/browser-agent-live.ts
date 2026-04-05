/**
 * Browser + Agent Live Test
 *
 * Tests that the agent controls the VISIBLE browser panel.
 * Opens Browser panel first, then asks the agent to navigate and interact.
 * Takes screenshots at each step to verify the browser updates in real time.
 *
 * Run: npx tsx e2e/browser-agent-live.ts
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SS_DIR = path.join(__dirname, 'screenshots', 'browser-live');
fs.mkdirSync(SS_DIR, { recursive: true });

let app: ElectronApplication;
let page: Page;
let shotCounter = 0;

async function shot(label: string): Promise<string> {
  shotCounter++;
  const name = `${String(shotCounter).padStart(2, '0')}-${label}.png`;
  const p = path.join(SS_DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}`);
  return p;
}

async function openPanel(title: string) {
  const btn = page.locator(`button[title="${title}"]`);
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(500);
  }
}

async function agentSend(message: string) {
  // Force-enable textarea
  await page.evaluate(() => {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) { ta.disabled = false; ta.removeAttribute('disabled'); ta.focus(); }
  });
  await page.waitForTimeout(100);
  const textarea = page.locator('textarea').first();
  await textarea.click({ force: true });
  await page.waitForTimeout(100);
  await textarea.selectText().catch(() => {});
  await page.keyboard.press('Backspace');
  await page.keyboard.type(message, { delay: 8 });
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
}

async function main() {
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

  // ── Setup: endpoint + model ────────────────────────
  console.log('=== Setup ===');
  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
    }
  });

  // Set store with endpoint + model
  await page.evaluate(() => {
    const storeKey = 'litebench-agent-chat';
    const stored = JSON.parse(localStorage.getItem(storeKey) || '{"state":{}}');
    stored.state = stored.state || {};
    stored.state.selectedEndpointId = 1;
    stored.state.selectedModelId = 'mistralai/devstral-small-2-2512';
    stored.state.enableTools = true;
    stored.state.conversations = stored.state.conversations || [];
    if (stored.state.conversations.length === 0) {
      stored.state.conversations = [{
        id: 'browser-test',
        name: 'Browser Test',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }];
      stored.state.activeConversationId = 'browser-test';
    }
    localStorage.setItem(storeKey, JSON.stringify(stored));
  });

  // Reload to pick up store
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length! > 0,
    undefined, { timeout: 15_000 },
  );
  await page.waitForTimeout(1500);

  // ── STEP 1: Open Browser panel FIRST ───────────────
  console.log('\n=== STEP 1: Open Browser Panel ===');
  await openPanel('Browser');
  await page.waitForTimeout(1000);
  await shot('browser-panel-open');

  // Verify browser session exists
  const browserUrl = await page.evaluate(() => {
    const urlInput = document.querySelector('input') as HTMLInputElement;
    return urlInput?.value || 'no input found';
  });
  console.log(`  Browser URL bar: ${browserUrl}`);

  // ── STEP 2: Open Agent Chat alongside ──────────────
  console.log('\n=== STEP 2: Open Agent Chat (split view) ===');
  await openPanel('Agent Chat');
  await page.waitForTimeout(500);

  // Switch to grid layout for side-by-side
  const gridBtn = page.locator('button[title*="Grid"], [title*="grid"]').first();
  if (await gridBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await gridBtn.click();
    await page.waitForTimeout(500);
  }
  await shot('split-view-agent-browser');

  // ── STEP 3: Ask agent to navigate the browser ──────
  console.log('\n=== STEP 3: Ask agent to navigate browser ===');
  await agentSend('Navigate the browser to https://news.ycombinator.com and tell me the top story title.');
  console.log('  Message sent, waiting for agent + browser...');

  // Take screenshots at intervals to capture the browser updating
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    await shot(`agent-browser-${(i + 1) * 5}s`);

    // Check if browser URL changed
    const currentUrl = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.value.includes('http')) return input.value;
      }
      return 'unknown';
    });
    console.log(`  [${(i + 1) * 5}s] Browser URL: ${currentUrl}`);
  }

  // ── STEP 4: Ask agent to navigate to Google ────────
  console.log('\n=== STEP 4: Navigate to Google ===');
  await agentSend('Now navigate to google.com and take a screenshot of it.');
  console.log('  Message sent...');

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    await shot(`agent-google-${(i + 1) * 5}s`);
  }

  // ── STEP 5: Final state ────────────────────────────
  console.log('\n=== STEP 5: Final state ===');
  await shot('final-state');

  // Check conversation state
  const state = await page.evaluate(() => {
    const raw = localStorage.getItem('litebench-agent-chat');
    if (!raw) return { found: false };
    const parsed = JSON.parse(raw);
    const convs = parsed?.state?.conversations || [];
    const conv = convs[0];
    return {
      messageCount: conv?.messages?.length || 0,
      toolCallsInMessages: conv?.messages?.filter((m: any) =>
        m.toolCalls && m.toolCalls.length > 0
      ).length || 0,
      browserToolCalls: conv?.messages?.reduce((acc: number, m: any) => {
        if (!m.toolCalls) return acc;
        return acc + m.toolCalls.filter((tc: any) =>
          tc.name?.startsWith('browser_')
        ).length;
      }, 0) || 0,
    };
  });
  console.log('  Store state:', JSON.stringify(state, null, 2));

  console.log('\n=== DONE ===');
  console.log(`Screenshots: ${SS_DIR}`);
  console.log(`Total: ${shotCounter}`);

  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
