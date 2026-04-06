/**
 * Arena Live Battle — Real E2E Test
 *
 * Spawns a REAL battle between 2 local models on actual endpoints.
 * Models generate websites sequentially (default mode).
 * Generated sites are left on disk for manual judging.
 *
 * Prerequisites:
 * - At least one local endpoint running (Ollama, LM Studio, etc.)
 * - At least 2 models available on that endpoint
 *
 * Output:
 * - Screenshots: e2e/screenshots/arena-live/
 * - Generated websites: battles/<battle-id>/competitor-*/index.html
 *
 * Run:  npx playwright test e2e/arena-live-battle.test.ts --timeout 600000
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SS_DIR = path.join(__dirname, 'screenshots', 'arena-live');
fs.mkdirSync(SS_DIR, { recursive: true });

// Long timeout — models need time to generate
test.setTimeout(600_000); // 10 minutes

let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  await page.screenshot({
    path: path.join(SS_DIR, `${name}.png`),
    fullPage: false,
  });
  console.log(`  📸 ${name}.png`);
}

async function waitAndShot(name: string, ms = 1000) {
  await page.waitForTimeout(ms);
  await shot(name);
}

test.beforeAll(async () => {
  console.log('Building LiteBench...');
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  console.log('Build complete.');

  console.log('Launching Electron...');
  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  console.log('App ready.');
});

test.afterAll(async () => {
  // DON'T close app — leave it open for manual judging
  console.log('\n=== APP LEFT OPEN FOR MANUAL JUDGING ===');
  console.log('Generated websites are in: battles/<battle-id>/competitor-*/');
  console.log('Close the app window manually when done reviewing.\n');
  // If you want auto-close, uncomment: if (app) await app.close();
});

test('Full Arena Battle — 2 models, sequential, website generation', async () => {
  // ─── Phase 1: Navigate to Arena ───
  console.log('\n── Phase 1: Open Arena Panel ──');

  // Find and click arena button in activity bar
  // Try all sidebar buttons until we find the arena
  const sidebarButtons = await page.locator('aside button, nav button, [class*="ctivity"] button')
    .filter({ has: page.locator('svg') })
    .all();

  let arenaFound = false;
  for (const btn of sidebarButtons) {
    await btn.click();
    await page.waitForTimeout(400);
    const arenaText = await page.locator('text=/Battle Arena/i').count();
    if (arenaText > 0) {
      arenaFound = true;
      console.log('  Arena panel opened');
      break;
    }
  }

  if (!arenaFound) {
    // Fallback: try clicking by text
    await page.locator('button:has-text("Arena")').first().click().catch(() => {});
    await page.waitForTimeout(400);
  }

  await shot('01-arena-opened');

  // ─── Phase 2: Discover endpoints and models ───
  console.log('\n── Phase 2: Discover Endpoints ──');

  // Wait for endpoints to load
  await page.waitForTimeout(2000);

  // Get available endpoints from the first select
  const endpointSelect = page.locator('select').first();
  const endpointOptions = await endpointSelect.locator('option').allTextContents();
  console.log(`  Available endpoints: ${endpointOptions.join(', ')}`);

  if (endpointOptions.length === 0 || endpointOptions[0] === 'No endpoints') {
    console.log('  ⚠️ No endpoints configured — skipping live battle');
    await shot('02-no-endpoints');
    test.skip();
    return;
  }

  await shot('02-endpoints-discovered');

  // Select first endpoint and discover models
  const firstEndpointValue = await endpointSelect.locator('option').first().getAttribute('value');
  await endpointSelect.selectOption(firstEndpointValue ?? '');
  await page.waitForTimeout(2000); // Wait for model discovery

  // Get model list
  const modelSelect = page.locator('select').nth(1);
  const modelOptions = await modelSelect.locator('option').allTextContents();
  const realModels = modelOptions.filter(m => m !== 'Select model' && m !== 'No models');
  console.log(`  Available models: ${realModels.join(', ')}`);

  if (realModels.length < 2) {
    console.log('  ⚠️ Need at least 2 models — skipping live battle');
    await shot('02-not-enough-models');
    test.skip();
    return;
  }

  // ─── Phase 3: Add 2 models ───
  console.log('\n── Phase 3: Select 2 Models ──');

  // Add first model
  const model1 = realModels[0];
  await modelSelect.selectOption({ label: model1 });
  await page.waitForTimeout(200);
  const addButton = page.locator('button[title="Add model"]');
  await addButton.click();
  console.log(`  Added model 1: ${model1}`);
  await page.waitForTimeout(300);

  // Add second model
  const model2 = realModels.length > 1 ? realModels[1] : realModels[0];
  await modelSelect.selectOption({ label: model2 });
  await page.waitForTimeout(200);
  await addButton.click();
  console.log(`  Added model 2: ${model2}`);
  await page.waitForTimeout(300);

  await shot('03-models-selected');

  // ─── Phase 4: Set challenge prompt ───
  console.log('\n── Phase 4: Set Challenge ──');

  const textarea = page.locator('textarea').first();
  await textarea.fill('');
  await textarea.fill(
    'Build a modern landing page for an AI productivity tool called "FlowState". ' +
    'Include a hero section with headline and CTA button, a 3-column feature grid, ' +
    'a testimonials section with 2 quotes, and a footer. Use a dark theme with ' +
    'purple and blue gradient accents. Make it visually striking and professional. ' +
    'Use write_file to create index.html with all CSS inline.'
  );
  console.log('  Challenge prompt set');
  await shot('04-prompt-set');

  // ─── Phase 5: Verify sequential mode is ON ───
  console.log('\n── Phase 5: Verify Sequential Mode ──');
  // Sequential is default — just verify the label text is there
  const seqText = await page.locator('text=/Sequential|single GPU/i').count();
  console.log(`  Sequential mode indicator found: ${seqText > 0}`);
  await shot('05-sequential-mode');

  // ─── Phase 6: Start Battle ───
  console.log('\n── Phase 6: START BATTLE ──');

  const battleButton = page.locator('button').filter({ hasText: /Battle/i }).first();
  const isEnabled = await battleButton.isEnabled();
  console.log(`  Battle button enabled: ${isEnabled}`);

  if (!isEnabled) {
    console.log('  ⚠️ Battle button not enabled — check model selection');
    await shot('06-battle-disabled');
    test.skip();
    return;
  }

  await battleButton.click();
  console.log('  ⚡ Battle started!');
  await page.waitForTimeout(2000);
  await shot('06-battle-started');

  // ─── Phase 7: Monitor battle progress ───
  console.log('\n── Phase 7: Monitor Progress ──');

  // Wait for building phase indicator
  const buildingIndicator = page.locator('text=/Building|in Progress/i');
  try {
    await buildingIndicator.waitFor({ timeout: 10_000 });
    console.log('  Building phase active');
  } catch {
    console.log('  Warning: Building indicator not found (may have already progressed)');
  }
  await shot('07-building-phase');

  // Take periodic screenshots while battle runs
  let battleDone = false;
  let screenshotCount = 0;
  const maxWait = 8 * 60_000; // 8 minutes max
  const startTime = Date.now();

  while (!battleDone && Date.now() - startTime < maxWait) {
    await page.waitForTimeout(15_000); // Check every 15 seconds
    screenshotCount++;

    // Check if we've moved to judging/results phase
    const judgingText = await page.locator('text=/Judging|Results|Pick Winner/i').count();
    if (judgingText > 0) {
      battleDone = true;
      console.log(`  ✅ Battle complete! (took ${Math.round((Date.now() - startTime) / 1000)}s)`);
    } else {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ... ${elapsed}s elapsed, still building`);
    }

    // Screenshot every 30 seconds
    if (screenshotCount % 2 === 0 || battleDone) {
      await shot(`07-progress-${screenshotCount}`);
    }
  }

  if (!battleDone) {
    console.log('  ⚠️ Battle timed out after 8 minutes');
    await shot('07-timeout');
  }

  // ─── Phase 8: Judging Phase ───
  console.log('\n── Phase 8: Judging Phase ──');
  await page.waitForTimeout(3000);
  await shot('08-judging-panel');

  // Check for competitor previews (iframes)
  const iframes = await page.locator('iframe').count();
  console.log(`  Preview iframes found: ${iframes}`);

  // Check for Pick Winner buttons
  const pickButtons = await page.locator('button').filter({ hasText: /Pick Winner|Select/i }).count();
  console.log(`  Pick Winner buttons: ${pickButtons}`);

  // Check for metric scores
  const metricBars = await page.locator('[class*="metric"], [class*="score"], [class*="bar"]').count();
  console.log(`  Metric elements: ${metricBars}`);

  await shot('08-judging-full');

  // ─── Phase 9: Verify generated files exist ───
  console.log('\n── Phase 9: Verify Generated Files ──');

  const battlesDir = path.join(PROJECT_ROOT, 'battles');
  if (fs.existsSync(battlesDir)) {
    const battleDirs = fs.readdirSync(battlesDir);
    console.log(`  Battle directories: ${battleDirs.length}`);

    for (const dir of battleDirs) {
      const battlePath = path.join(battlesDir, dir);
      if (!fs.statSync(battlePath).isDirectory()) continue;

      const competitors = fs.readdirSync(battlePath).filter(f =>
        fs.statSync(path.join(battlePath, f)).isDirectory()
      );

      for (const comp of competitors) {
        const compPath = path.join(battlePath, comp);
        const files = fs.readdirSync(compPath);
        const hasIndex = files.includes('index.html');
        console.log(`  ${dir}/${comp}: ${files.join(', ')} ${hasIndex ? '✅' : '❌ no index.html'}`);

        if (hasIndex) {
          const html = fs.readFileSync(path.join(compPath, 'index.html'), 'utf-8');
          console.log(`    index.html size: ${html.length} bytes`);
        }
      }
    }
  } else {
    console.log('  ⚠️ No battles directory found');
  }

  await shot('09-final-state');

  console.log('\n══════════════════════════════════════');
  console.log('  BATTLE COMPLETE — READY FOR JUDGING');
  console.log('  Generated sites in: battles/');
  console.log('  App is open — pick a winner manually');
  console.log('══════════════════════════════════════\n');
});
