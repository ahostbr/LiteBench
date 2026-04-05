/**
 * Phase 5 Screenshots — LiteBench Agent System
 *
 * Captures all new panels: Agent Chat, Browser, Agent Benchmark.
 * Also captures the updated ActivityBar with all icons.
 *
 * Output: e2e/screenshots/phase5/
 *
 * Run:  npx playwright test e2e/phase5-screenshots.test.ts
 */
import { test, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SS_DIR = path.join(__dirname, 'screenshots', 'phase5')
fs.mkdirSync(SS_DIR, { recursive: true })

let app: ElectronApplication
let page: Page

async function shot(name: string) {
  await page.screenshot({
    path: path.join(SS_DIR, `${name}.png`),
    fullPage: false,
  })
  console.log(`  Screenshot: ${name}.png`)
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

  // Wait for React to mount
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length! > 0,
    undefined,
    { timeout: 30_000 },
  )

  // Resize for marketing shots
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

test.describe.serial('Phase 5 — Agent System Screenshots', () => {
  test('01 — Dashboard with full ActivityBar', async () => {
    // Dashboard should be the default panel, showing the full icon bar
    await shot('01-dashboard-full-activitybar')
  })

  test('02 — Agent Chat panel (empty state)', async () => {
    // Click the Agent Chat icon (MessageSquare) in ActivityBar
    const agentBtn = page.locator('button[title="Agent Chat"]')
    await agentBtn.click()
    await page.waitForTimeout(800)
    await shot('02-agent-chat-empty')
  })

  test('03 — Agent Chat with setup banner', async () => {
    // The setup banner should appear showing dependency check status
    // Wait a moment for the async dep check
    await page.waitForTimeout(2000)
    await shot('03-agent-chat-setup-banner')
  })

  test('04 — Agent Chat input area', async () => {
    // Input may be disabled without an endpoint — just screenshot the panel state
    await shot('04-agent-chat-input')
  })

  test('05 — Agent Chat conversation sidebar', async () => {
    // Toggle the conversation sidebar
    const sidebarBtn = page.locator('button[title*="conversation"], button[title*="Conversation"], button[title*="Show"]').first()
    if (await sidebarBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sidebarBtn.click()
      await page.waitForTimeout(500)
    }
    await shot('05-agent-chat-sidebar')

    // Close sidebar for clean shots
    if (await sidebarBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sidebarBtn.click()
      await page.waitForTimeout(300)
    }
  })

  test('06 — Browser panel', async () => {
    // Click the Browser icon (Globe) in ActivityBar
    const browserBtn = page.locator('button[title="Browser"]')
    if (await browserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await browserBtn.click()
      await page.waitForTimeout(1000)
    }
    await shot('06-browser-panel')
  })

  test('07 — Agent Benchmark panel (idle)', async () => {
    // Click the Agent Benchmark icon (Microscope) in ActivityBar
    const benchBtn = page.locator('button[title="Agent Benchmark"]')
    if (await benchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await benchBtn.click()
      await page.waitForTimeout(800)
    }
    await shot('07-agent-benchmark-idle')
  })

  test('08 — Run Benchmark panel (existing)', async () => {
    // Click the Run Benchmark icon for comparison
    const runBtn = page.locator('button[title="Run Benchmark"]')
    if (await runBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await runBtn.click()
      await page.waitForTimeout(500)
    }
    await shot('08-run-benchmark')
  })

  test('09 — Test Suites (verify Agent Suite)', async () => {
    // Click Test Suites to see if Agent Suite is seedable
    const suitesBtn = page.locator('button[title="Test Suites"]')
    if (await suitesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suitesBtn.click()
      await page.waitForTimeout(500)
    }
    await shot('09-test-suites')
  })

  test('10 — All panels open (tab layout)', async () => {
    // Open all key panels to show the tab bar
    for (const title of ['Dashboard', 'Agent Chat', 'Browser', 'Agent Benchmark']) {
      const btn = page.locator(`button[title="${title}"]`)
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(300)
      }
    }
    await page.waitForTimeout(500)
    await shot('10-all-panels-tabs')
  })
})
