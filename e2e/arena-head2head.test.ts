/**
 * Head-to-Head: Stock Devstral vs Abliterated Devstral
 * Direct IPC — bypasses UI. Sequential with auto-unload.
 * Opens both generated sites in browser for manual judging.
 */
import { test, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SS_DIR = path.join(__dirname, 'screenshots', 'head2head');
fs.mkdirSync(SS_DIR, { recursive: true });

test.setTimeout(600_000);

let app: ElectronApplication;
let page: Page;

const PROMPT = `Build a modern landing page for an AI productivity tool called "FlowState". Include a hero section with headline and CTA button, a 3-column feature grid, a testimonials section with 2 quotes, and a footer. Use a dark theme. Use write_file to create index.html with ALL CSS inline in a <style> tag.

DESIGN REQUIREMENTS:
- Import 2 Google Fonts (one display, one body) via @import — NO system fonts
- Bold color palette: deep dark background with one sharp accent that pops
- CSS animations: staggered page-load reveal, hover effects with glow/scale
- Glassmorphism or layered shadows on cards
- SVG noise texture overlay on body
- Responsive design
- The result should look designed by a senior UI designer, not AI-generated.`;

test.beforeAll(async () => {
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  const builtDb = path.join(PROJECT_ROOT, 'out', 'main', 'backend', 'litebench.db');
  fs.mkdirSync(path.dirname(builtDb), { recursive: true });
  fs.copyFileSync(path.join(PROJECT_ROOT, 'backend', 'litebench.db'), builtDb);

  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [ERR] ${msg.text()}`);
    // Also log arena-related messages
    const text = msg.text();
    if (text.includes('[Arena]') || text.includes('Unload')) console.log(`  [LOG] ${text}`);
  });
  await page.waitForTimeout(3000);
  console.log('Ready.\n');
});

test.afterAll(async () => {
  console.log('\n=== REVIEW BOTH SITES IN YOUR BROWSER ===\n');
});

test('Stock Devstral vs Abliterated — head to head', async () => {
  console.log('══ HEAD-TO-HEAD: Devstral vs Abliterated ══\n');

  // Start battle via direct IPC — sequential mode
  console.log('Starting battle (sequential, auto-unload between rounds)...');
  const battleResult = await page.evaluate(async (config) => {
    try {
      // @ts-ignore
      const battle = await window.liteBench.arena.startBattle(config);
      return { ok: true, id: battle?.id, competitors: battle?.competitors?.length ?? 0 };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }, {
    prompt: PROMPT,
    competitors: [
      { endpointId: 1, modelId: 'mistralai/devstral-small-2-2512' },
      { endpointId: 1, modelId: 'huihui-devstral-small-2-24b-instruct-2512-abliterated-i1' },
    ],
    sequential: true,
  });

  if (!battleResult.ok) {
    console.log(`❌ Failed: ${battleResult.error}`);
    return;
  }

  console.log(`✅ Battle ${battleResult.id} started\n`);
  await page.screenshot({ path: path.join(SS_DIR, 'battle-started.png') });

  // Poll for completion — check for output files
  const battlesDir = path.join(PROJECT_ROOT, 'out', 'main', 'battles', battleResult.id!);
  const maxWait = 8 * 60_000;
  const start = Date.now();
  let comp0Done = false;
  let comp1Done = false;

  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(10_000);
    const elapsed = Math.round((Date.now() - start) / 1000);

    const c0 = path.join(battlesDir, 'competitor-0', 'index.html');
    const c1 = path.join(battlesDir, 'competitor-1', 'index.html');

    if (!comp0Done && fs.existsSync(c0)) {
      comp0Done = true;
      const size = fs.statSync(c0).size;
      console.log(`  [${elapsed}s] Competitor 0 (Stock Devstral) DONE — ${size} bytes`);
    }

    if (!comp1Done && fs.existsSync(c1)) {
      comp1Done = true;
      const size = fs.statSync(c1).size;
      console.log(`  [${elapsed}s] Competitor 1 (Abliterated) DONE — ${size} bytes`);
    }

    if (comp0Done && comp1Done) {
      console.log(`\n✅ Both competitors finished in ${elapsed}s`);
      break;
    }

    if (!comp0Done && !comp1Done) {
      console.log(`  [${elapsed}s] Waiting for first competitor...`);
    } else if (comp0Done && !comp1Done) {
      console.log(`  [${elapsed}s] Waiting for competitor 1 (abliterated)...`);
    }
  }

  await page.screenshot({ path: path.join(SS_DIR, 'battle-done.png') });

  // Open results
  console.log('\n══ RESULTS ══\n');
  const c0Path = path.join(battlesDir, 'competitor-0', 'index.html');
  const c1Path = path.join(battlesDir, 'competitor-1', 'index.html');

  if (fs.existsSync(c0Path)) {
    const size = fs.statSync(c0Path).size;
    console.log(`  Stock Devstral:      ${size} bytes`);
    execSync(`start "" "${c0Path}"`);
    console.log(`  → Opened in browser`);
  } else {
    console.log(`  Stock Devstral:      DNF`);
  }

  if (fs.existsSync(c1Path)) {
    const size = fs.statSync(c1Path).size;
    console.log(`  Abliterated Devstral: ${size} bytes`);
    execSync(`start "" "${c1Path}"`);
    console.log(`  → Opened in browser`);
  } else {
    console.log(`  Abliterated Devstral: DNF`);
  }

  console.log(`\n  Battle: ${battlesDir}`);
});
