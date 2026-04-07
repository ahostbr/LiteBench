/**
 * Arena Diagnostic — test the IPC call directly, skip all UI
 */
import { test, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');

test.setTimeout(120_000);

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' });

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

test('Diagnose arena IPC — call startBattle directly', async () => {
  // Call startBattle directly via the preload API, bypassing all UI
  const result = await page.evaluate(async () => {
    try {
      // @ts-ignore
      const api = window.liteBench;
      if (!api?.arena) return { error: 'window.liteBench.arena not found' };

      console.log('[DIAG] Calling startBattle...');
      const battle = await api.arena.startBattle({
        prompt: 'Build a simple hello world HTML page. Use write_file to create index.html with just <h1>Hello World</h1>.',
        competitors: [
          { endpointId: 1, modelId: 'mistralai/devstral-small-2-2512' },
        ],
      });

      return {
        success: true,
        battleId: battle?.id,
        phase: battle?.phase,
        competitorCount: battle?.competitors?.length,
        firstCompetitor: battle?.competitors?.[0],
      };
    } catch (err: any) {
      return {
        error: err?.message || String(err),
        stack: err?.stack?.substring(0, 500),
      };
    }
  });

  console.log('\n══ DIAGNOSTIC RESULT ══');
  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    console.log(`\n❌ IPC FAILED: ${result.error}`);
  } else {
    console.log(`\n✅ Battle started: ${result.battleId}`);
    console.log(`   Phase: ${result.phase}`);
    console.log(`   Competitors: ${result.competitorCount}`);

    // Wait for model to generate
    console.log('\n   Waiting 30s for model to work...');
    await page.waitForTimeout(30_000);

    // Check for output files
    const battlesDir = path.join(PROJECT_ROOT, 'out', 'main', 'battles');
    if (fs.existsSync(battlesDir)) {
      const dirs = fs.readdirSync(battlesDir);
      console.log(`   Battle dirs: ${dirs.join(', ')}`);
      for (const d of dirs) {
        const bp = path.join(battlesDir, d);
        if (fs.statSync(bp).isDirectory()) {
          const comps = fs.readdirSync(bp);
          for (const c of comps) {
            const cp = path.join(bp, c);
            if (fs.statSync(cp).isDirectory()) {
              const files = fs.readdirSync(cp);
              console.log(`   ${d}/${c}: ${files.length > 0 ? files.join(', ') : 'EMPTY'}`);
            }
          }
        }
      }
    } else {
      console.log('   No battles directory yet');
    }
  }
});
