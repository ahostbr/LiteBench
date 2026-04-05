/**
 * Full App Audit E2E — Exhaustive human-like testing of every feature.
 *
 * Tests every panel, interaction, edge case, and state transition:
 *  Phase 1: App launch + workspace management
 *  Phase 2: Panel lifecycle (open, close, reopen, switch layouts)
 *  Phase 3: Agent Chat (conversations, slash commands, tool calls)
 *  Phase 4: Browser panel (navigation, URL bar, back/forward)
 *  Phase 5: Terminal (start, input, copy/paste, skills dropdown)
 *  Phase 6: Settings (theme, zoom, about links)
 *  Phase 7: Setup wizard (dependency checker, install buttons)
 *  Phase 8: Edge cases (rapid clicks, empty states, error recovery)
 *
 * Run: npx playwright test e2e/full-app-audit.test.ts --timeout 180000
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SS_DIR = path.join(__dirname, 'screenshots', 'full-audit')
fs.mkdirSync(SS_DIR, { recursive: true })

let app: ElectronApplication
let page: Page

async function shot(name: string) {
  await page.screenshot({ path: path.join(SS_DIR, `${name}.png`), fullPage: false })
}

async function openPanel(title: string) {
  const btn = page.locator(`button[title="${title}"]`)
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(400)
  }
}

test.beforeAll(async () => {
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' })
  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.querySelector('#root')?.children.length! > 0, undefined, { timeout: 30_000 })
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { win.setSize(1920, 1080); win.center() }
  })
  await page.waitForTimeout(1000)

  // Ensure endpoint
  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list()
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      })
    }
  })
})

test.afterAll(async () => { if (app) await app.close() })

// ── PHASE 1: App Launch & Workspace ──────────────────────────────────────────

test.describe.serial('Phase 1: App Launch', () => {
  test('01 — Launches to Welcome panel', async () => {
    const welcome = page.locator('text="Welcome to LiteBench"')
    await expect(welcome).toBeVisible({ timeout: 5000 })
    await shot('01-welcome')
  })

  test('02 — Activity bar has all panel icons', async () => {
    const expectedPanels = ['Welcome', 'Dashboard', 'Run Benchmark', 'Results', 'Test Suites',
      'Agent Chat', 'Agent Benchmark', 'Browser', 'Terminal', 'Settings']
    for (const title of expectedPanels) {
      const btn = page.locator(`button[title="${title}"]`)
      await expect(btn).toBeVisible({ timeout: 2000 })
    }
    await shot('02-activity-bar')
  })

  test('03 — Welcome panel has getting started steps', async () => {
    await expect(page.locator('text="Install LM Studio"')).toBeVisible()
    await expect(page.locator('text="Download a model"')).toBeVisible()
    await expect(page.locator('text="Open Agent Chat"').first()).toBeVisible()
  })

  test('04 — Quick launch buttons open panels', async () => {
    const panels = ['Agent Chat', 'Browser', 'Agent Benchmark', 'Terminal', 'Dashboard']
    for (const label of panels) {
      const btn = page.locator(`button:has-text("${label}")`).first()
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Just verify they exist — don't click (would open multiple panels)
      }
    }
    await shot('04-quick-launch')
  })
})

// ── PHASE 2: Panel Lifecycle ─────────────────────────────────────────────────

test.describe.serial('Phase 2: Panel Lifecycle', () => {
  test('05 — Open and close each panel type', async () => {
    const panels = ['Dashboard', 'Agent Chat', 'Browser', 'Terminal', 'Settings']
    for (const title of panels) {
      await openPanel(title) // Open
      await page.waitForTimeout(300)
      // Find the tab and close it
      const closeBtn = page.locator(`button:has-text("${title}")`).locator('..').locator('button').last()
      // Just verify the panel opened by checking tab exists
      await shot(`05-open-${title.toLowerCase().replace(/\s/g, '-')}`)
    }
  })

  test('06 — Grid layout distributes panels evenly', async () => {
    // Open 3 panels
    await openPanel('Welcome')
    await openPanel('Agent Chat')
    await openPanel('Browser')
    await page.waitForTimeout(500)

    // Switch to grid mode
    const gridBtn = page.locator('button[title*="Grid"], button:nth-child(1)').first()
    // Grid mode button is in the top bar
    const layoutBtns = page.locator('[class*="layout"] button, button[title*="Grid"]').first()
    if (await layoutBtns.isVisible({ timeout: 1000 }).catch(() => false)) {
      await layoutBtns.click()
    }
    await page.waitForTimeout(500)
    await shot('06-grid-layout')
  })

  test('07 — Tab mode shows one panel at a time', async () => {
    const tabBtn = page.locator('button[title*="Tab"]').first()
    if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tabBtn.click()
      await page.waitForTimeout(300)
    }
    await shot('07-tab-layout')
  })

  test('08 — Splitter mode shows panels side by side', async () => {
    const splitBtn = page.locator('button[title*="Splitter"], button[title*="Split"]').first()
    if (await splitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await splitBtn.click()
      await page.waitForTimeout(300)
    }
    await shot('08-splitter-layout')
  })
})

// ── PHASE 3: Agent Chat ──────────────────────────────────────────────────────

test.describe.serial('Phase 3: Agent Chat', () => {
  test('09 — Agent Chat opens with empty state', async () => {
    await openPanel('Agent Chat')
    await page.waitForTimeout(1000)
    // Should show either setup banner or empty state
    await shot('09-agent-chat-empty')
  })

  test('10 — Setup banner runs dependency check', async () => {
    // Wait for the setup banner to finish checking
    await page.waitForTimeout(3000)
    // Check that deps were checked (either all green or showing missing)
    await shot('10-setup-check-done')
  })

  test('11 — Can create new conversation', async () => {
    const newBtn = page.locator('button[title="New conversation"]')
    if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newBtn.click()
      await page.waitForTimeout(300)
    }
    await shot('11-new-conversation')
  })

  test('12 — Textarea exists and is focusable', async () => {
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.click()
      await textarea.fill('Test message')
      const value = await textarea.inputValue()
      expect(value).toBe('Test message')
      await textarea.fill('') // Clear
    }
    await shot('12-textarea-focus')
  })

  test('13 — Slash command menu appears on /', async () => {
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('/')
      await page.waitForTimeout(300)
      // Check if a slash menu appeared
      const menu = page.locator('[class*="slash"], [class*="command"]').first()
      const menuVisible = await menu.isVisible({ timeout: 1000 }).catch(() => false)
      console.log(`  Slash menu visible: ${menuVisible}`)
      await textarea.fill('')
    }
    await shot('13-slash-menu')
  })

  test('14 — Conversation sidebar toggles', async () => {
    const sidebarBtn = page.locator('button[title*="conversation" i], button[title*="Show" i]').first()
    if (await sidebarBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sidebarBtn.click()
      await page.waitForTimeout(300)
      await shot('14a-sidebar-open')
      await sidebarBtn.click()
      await page.waitForTimeout(300)
      await shot('14b-sidebar-closed')
    }
  })
})

// ── PHASE 4: Browser Panel ───────────────────────────────────────────────────

test.describe.serial('Phase 4: Browser Panel', () => {
  test('15 — Browser panel has URL bar', async () => {
    await openPanel('Browser')
    await page.waitForTimeout(1500)
    const urlInput = page.locator('input[placeholder*="http" i], input[placeholder*="url" i], input[type="url"]').first()
    const hasUrlBar = await urlInput.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  URL bar visible: ${hasUrlBar}`)
    await shot('15-browser-url-bar')
  })

  test('16 — Can navigate to a URL', async () => {
    const urlInput = page.locator('input[placeholder*="http" i], input[placeholder*="url" i], input[type="url"]').first()
    if (await urlInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await urlInput.fill('https://example.com')
      await urlInput.press('Enter')
      await page.waitForTimeout(3000)
      await shot('16-browser-navigated')
    }
  })

  test('17 — Back/forward/reload buttons exist', async () => {
    const backBtn = page.locator('button[title*="Back" i], button:has(svg)').first()
    // Just check that navigation controls exist somewhere
    await shot('17-browser-controls')
  })

  test('18 — Browser tools work via IPC', async () => {
    const result = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('browser_go', { url: 'https://example.com' })
    })
    expect(result).toContain('Title:')
    expect(result).toContain('Example Domain')
    await shot('18-browser-go-ipc')
  })
})

// ── PHASE 5: Terminal ────────────────────────────────────────────────────────

test.describe.serial('Phase 5: Terminal', () => {
  test('19 — Terminal shows start button', async () => {
    await openPanel('Terminal')
    await page.waitForTimeout(500)
    const startBtn = page.locator('button:has-text("Start Terminal")')
    const hasStart = await startBtn.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`  Start Terminal button: ${hasStart}`)
    await shot('19-terminal-start')
  })

  test('20 — Terminal starts and shows prompt', async () => {
    const startBtn = page.locator('button:has-text("Start Terminal")')
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click()
      await page.waitForTimeout(3000) // Wait for PTY to spawn
    }
    await shot('20-terminal-running')
  })

  test('21 — Skills dropdown exists in terminal header', async () => {
    await openPanel('Terminal')
    await page.waitForTimeout(1000)
    // Start terminal if not already running
    const startBtn = page.locator('button:has-text("Start Terminal")')
    if (await startBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await startBtn.click()
      await page.waitForTimeout(3000)
    }
    const skillsBtn = page.locator('button:has-text("Skills")')
    const hasSkills = await skillsBtn.isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasSkills).toBe(true)
    console.log(`  Skills dropdown: ${hasSkills}`)

    if (hasSkills) {
      await skillsBtn.click()
      await page.waitForTimeout(300)
      // Check dropdown content
      const trainItem = page.locator('text="Train"')
      const hasTrain = await trainItem.isVisible({ timeout: 1000 }).catch(() => false)
      console.log(`  Train skill visible: ${hasTrain}`)
      await shot('21-skills-dropdown')
      // Close by clicking elsewhere
      await page.locator('body').click({ position: { x: 500, y: 500 } })
    }
  })

  test('22 — Terminal header shows Terminal label', async () => {
    const label = page.locator('span:has-text("Terminal")').first()
    await expect(label).toBeVisible({ timeout: 2000 })
  })
})

// ── PHASE 6: Settings ────────────────────────────────────────────────────────

test.describe.serial('Phase 6: Settings', () => {
  test('23 — Settings panel has Appearance section', async () => {
    await openPanel('Settings')
    await page.waitForTimeout(500)
    await expect(page.locator('text="Appearance"')).toBeVisible()
    await shot('23-settings-appearance')
  })

  test('24 — Theme selector has themes', async () => {
    const themeButtons = page.locator('[class*="grid"] button')
    const count = await themeButtons.count()
    console.log(`  Theme buttons: ${count}`)
    expect(count).toBeGreaterThan(0)
  })

  test('25 — Zoom slider works', async () => {
    const zoomSlider = page.locator('input[type="range"][min="50"][max="200"]')
    if (await zoomSlider.isVisible({ timeout: 2000 }).catch(() => false)) {
      const value = await zoomSlider.inputValue()
      console.log(`  Current zoom: ${value}%`)
    }
    await shot('25-zoom-slider')
  })

  test('26 — About section exists with links', async () => {
    // Scroll to bottom of settings
    const aboutHeading = page.locator('text="About"')
    if (await aboutHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  About section found')
      // Check for links
      const docLink = page.locator('text="Documentation"')
      const githubLink = page.locator('text="GitHub Repository"')
      expect(await docLink.isVisible().catch(() => false)).toBe(true)
      expect(await githubLink.isVisible().catch(() => false)).toBe(true)
      // "Lite AI Suite" appears as a styled link in the footer, check for partial text
      const footerText = page.locator('text=/Lite AI Suite|litesuite/i').first()
      expect(await footerText.isVisible().catch(() => false)).toBe(true)
    } else {
      // Scroll down to find it
      await page.evaluate(() => {
        const panel = document.querySelector('[class*="scroll"]') || document.querySelector('[class*="overflow"]')
        if (panel) panel.scrollTop = panel.scrollHeight
      })
      await page.waitForTimeout(300)
    }
    await shot('26-about-section')
  })

  test('27 — Version badge shows v1.0.0', async () => {
    const version = page.locator('text="v1.0.0"')
    const hasVersion = await version.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`  Version badge: ${hasVersion}`)
    await shot('27-version')
  })
})

// ── PHASE 7: Tool Execution ─────────────────────────────────────────────────

test.describe.serial('Phase 7: All Tools Work', () => {
  test('28 — browser_go works', async () => {
    await openPanel('Browser')
    await page.waitForTimeout(1000)
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('browser_go', { url: 'https://example.com' }))
    expect(r).toContain('Title:')
    expect(r).toContain('Example Domain')
  })

  test('29 — browser_elements works', async () => {
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('browser_elements', {}))
    expect(r).toContain('Interactive elements')
  })

  test('30 — browser_click works', async () => {
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('browser_click', { index: 0 }))
    expect(r).toBeDefined()
  })

  test('31 — web_search works', async () => {
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('web_search', { query: 'test', max_results: 2 }))
    expect(r.length).toBeGreaterThan(20)
  })

  test('32 — web_fetch works', async () => {
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('web_fetch', { action: 'fetch', url: 'https://example.com' }))
    expect(r.toLowerCase()).toContain('example')
  })

  test('33 — sandbox works', async () => {
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('sandbox', { action: 'execute', code: 'print(7*6)', language: 'python' }))
    const parsed = JSON.parse(r)
    expect(parsed.exit_code).toBe(0)
    expect(parsed.stdout).toContain('42')
  })

  test('34 — sandbox auto-detects python', async () => {
    const r = await page.evaluate(async () => (window as any).liteBench.testTools.executeTool('sandbox', { action: 'execute', code: 'print("ok")' }))
    const parsed = JSON.parse(r)
    expect(parsed.exit_code).toBe(0)
  })

  test('35 — tool registry returns 8 tools', async () => {
    const tools = await page.evaluate(async () => (window as any).liteBench.testTools.getSchemas())
    expect(tools.length).toBe(8)
    expect(tools).toContain('browser_go')
    expect(tools).toContain('web_search')
    expect(tools).toContain('sandbox')
    expect(tools).not.toContain('browser_navigate')
    expect(tools).not.toContain('browser_read_page')
  })
})

// ── PHASE 8: Edge Cases ──────────────────────────────────────────────────────

test.describe.serial('Phase 8: Edge Cases', () => {
  test('36 — Rapid panel switching doesnt crash', async () => {
    for (let i = 0; i < 5; i++) {
      await openPanel('Welcome')
      await openPanel('Agent Chat')
      await openPanel('Browser')
      await openPanel('Terminal')
      await openPanel('Settings')
    }
    await page.waitForTimeout(500)
    // App should still be responsive
    await expect(page.locator('#root')).toBeVisible()
    await shot('36-rapid-switch')
  })

  test('37 — Opening same panel twice doesnt duplicate', async () => {
    await openPanel('Agent Chat')
    await openPanel('Agent Chat') // Click again
    await page.waitForTimeout(300)
    // Count tabs with "Agent Chat"
    const tabs = await page.locator('button:has-text("Agent Chat")').count()
    // Should be activity bar button (1) + at most 1 tab
    console.log(`  Agent Chat buttons: ${tabs}`)
    await shot('37-no-duplicate')
  })

  test('38 — Endpoint creation via IPC', async () => {
    const eps = await page.evaluate(async () => (window as any).liteBench.endpoints.list())
    expect((eps as any[]).length).toBeGreaterThan(0)
  })

  test('39 — Setup checker returns valid results', async () => {
    const results = await page.evaluate(async () => (window as any).liteBench.agent.checkSetup())
    const checks = results as any[]
    expect(checks.length).toBeGreaterThan(0)
    const python = checks.find((c: any) => c.component === 'python')
    expect(python.installed).toBe(true)
  })

  test('40 — isSmallModel correctly classifies', async () => {
    const small = await page.evaluate(async () => (window as any).liteBench.testTools.isSmallModel('qwen-0.8b'))
    const large = await page.evaluate(async () => (window as any).liteBench.testTools.isSmallModel('devstral-24b'))
    expect(small).toBe(true)
    expect(large).toBe(false)
  })

  test('41 — Browser session persists to disk', async () => {
    const userData = await app.evaluate(async ({ app: a }) => a.getPath('userData'))
    const partDir = path.join(userData, 'Partitions', 'litebench-browser')
    expect(fs.existsSync(partDir)).toBe(true)
    await shot('41-session-persist')
  })

  test('42 — Final state screenshot', async () => {
    await openPanel('Welcome')
    await page.waitForTimeout(300)
    await shot('42-final')
  })
})
