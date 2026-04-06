/**
 * Arena System — E2E Screenshot Tests
 *
 * Tests the Arena panel step by step with verification screenshots.
 *
 * Output: e2e/screenshots/arena/
 *
 * Run:  npx playwright test e2e/arena-screenshots.test.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SS_DIR = path.join(__dirname, 'screenshots', 'arena');
fs.mkdirSync(SS_DIR, { recursive: true });

let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  await page.screenshot({
    path: path.join(SS_DIR, `${name}.png`),
    fullPage: false,
  });
  console.log(`  Screenshot: ${name}.png`);
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
  await page.waitForTimeout(2000);
  console.log('App ready.');
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('01 — App launches with activity bar visible', async () => {
  await shot('01-app-launched');
  // Activity bar uses Tailwind classes (hashed in prod), find by structure: aside or narrow sidebar with buttons
  const sidebar = page.locator('aside, [role="navigation"]').first();
  const hasSidebar = await sidebar.count();
  // Fallback: just verify buttons with SVG icons exist (activity bar icons)
  const iconButtons = await page.locator('button').filter({ has: page.locator('svg') }).count();
  console.log(`  Sidebar elements: ${hasSidebar}, Icon buttons: ${iconButtons}`);
  expect(iconButtons).toBeGreaterThan(3);
});

test('02 — Arena icon (Swords) exists in activity bar', async () => {
  // Look for the arena/swords button in the activity bar
  const arenaButton = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
  const buttons = await page.locator('button').filter({ has: page.locator('svg') }).all();
  console.log(`  Found ${buttons.length} icon buttons in activity bar`);
  await shot('02-activity-bar-buttons');
});

test('03 — Click Arena panel opens', async () => {
  // Find and click the arena button — it should have the Swords icon
  // Try finding by title, aria-label, or data attribute first
  let arenaBtn = page.locator('button[title*="rena" i], button[aria-label*="rena" i]').first();
  let found = await arenaBtn.count();

  if (!found) {
    // Fall back: look for buttons in the activity bar area, arena should be one of the later ones
    const allButtons = page.locator('aside button, [class*="ctivity"] button, nav button').all();
    const buttons = await allButtons;
    console.log(`  Trying ${buttons.length} sidebar buttons...`);
    // Click each and check if arena panel appears
    for (let i = 0; i < buttons.length; i++) {
      await buttons[i].click();
      await page.waitForTimeout(300);
      const arenaPanel = await page.locator('text=/Arena|Battle|Preset|Landing Page/i').count();
      if (arenaPanel > 0) {
        console.log(`  Arena panel found at button index ${i}`);
        break;
      }
    }
  } else {
    await arenaBtn.click();
  }

  await page.waitForTimeout(500);
  await shot('03-arena-panel-opened');
});

test('04 — Arena panel shows BattleConfig', async () => {
  // Should see the battle configuration UI
  const configElements = await page.locator('text=/model|endpoint|prompt|battle/i').count();
  console.log(`  Config elements found: ${configElements}`);
  await shot('04-battle-config');
});

test('05 — Preset challenge cards render', async () => {
  // Look for preset challenge cards (Landing Page, Portfolio, Dashboard, etc.)
  const presetText = await page.locator('text=/Landing Page|Portfolio|Dashboard|E-Commerce|Blog|Restaurant/i').count();
  console.log(`  Preset challenge text matches: ${presetText}`);
  await shot('05-preset-challenges');
  expect(presetText).toBeGreaterThan(0);
});

test('06 — Click a preset fills the prompt', async () => {
  // Click the "Landing Page" preset
  const landingCard = page.locator('text=/Landing Page/i').first();
  if (await landingCard.count() > 0) {
    await landingCard.click();
    await page.waitForTimeout(300);
  }
  await shot('06-preset-selected');

  // Check that a textarea/input got populated
  const textarea = page.locator('textarea').first();
  if (await textarea.count() > 0) {
    const value = await textarea.inputValue();
    console.log(`  Prompt textarea value length: ${value.length}`);
    expect(value.length).toBeGreaterThan(0);
  }
});

test('07 — Model picker is visible', async () => {
  // Should see endpoint/model selection UI
  const selects = await page.locator('select, [role="combobox"], [class*="select" i], [class*="picker" i], [class*="endpoint" i]').count();
  console.log(`  Select/picker elements: ${selects}`);
  await shot('07-model-picker');
});

test('08 — Full arena panel state', async () => {
  // Capture the full state of the arena panel
  await page.waitForTimeout(500);
  await shot('08-arena-full-state');
});
