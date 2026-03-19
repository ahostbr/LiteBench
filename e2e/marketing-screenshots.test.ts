/**
 * Marketing Screenshots — LiteBench
 *
 * Pre-intel phase: baseline captures before GUI overhaul.
 * UI: TitleBar + Sidebar (Dashboard, Run Benchmark, Results, Test Suites).
 *
 * Output: e2e/screenshots/marketing/
 *
 * Run:  npx playwright test e2e/marketing-screenshots.test.ts
 */
import { test, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SS_DIR = path.join(__dirname, 'screenshots', 'marketing')
fs.mkdirSync(SS_DIR, { recursive: true })

let app: ElectronApplication
let page: Page

async function shot(name: string) {
  await page.screenshot({ path: path.join(SS_DIR, `${name}.png`), fullPage: false })
}

test.beforeAll(async () => {
  console.log('Building LiteBench...')
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' })
  console.log('Build complete.')

  console.log('Launching Electron...')
  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
  })

  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Wait for React
  await page.waitForFunction(() => {
    return document.querySelector('#root')?.children.length! > 0
  }, undefined, { timeout: 30_000 })

  // Resize for marketing
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setSize(1920, 1080)
      win.center()
    }
  })
  await page.waitForTimeout(1000)
  console.log('App ready.')
})

test.afterAll(async () => {
  if (app) await app.close()
})

// Sidebar: Dashboard, Run Benchmark, Results, Test Suites

test.describe.serial('Marketing Screenshots — LiteBench', () => {

  test('01 — Dashboard', async () => {
    await shot('01-dashboard')
  })

  test('02 — Run Benchmark', async () => {
    const btn = page.locator('button:text("Run Benchmark"), a:text("Run Benchmark"), [data-page="runner"]').first()
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(500)
    }
    await shot('02-run-benchmark')
  })

  test('03 — Results', async () => {
    const btn = page.locator('button:text("Results"), a:text("Results"), [data-page="results"]').first()
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(500)
    }
    await shot('03-results')
  })

  test('04 — Test Suites', async () => {
    const btn = page.locator('button:text("Test Suites"), a:text("Test Suites"), [data-page="tests"]').first()
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(500)
    }
    await shot('04-test-suites')
  })
})
