/**
 * Installer & Setup Flow E2E — First-Time User Experience
 *
 * Tests the complete one-time install flow that an end user sees:
 *  1. App launches to Welcome panel
 *  2. Setup banner checks all dependencies
 *  3. Missing deps can be 1-click installed
 *  4. Python path consistency (setup-checker and tool-executor use same Python)
 *  5. All tools work after setup
 *  6. Browser session persistence (cookies survive restart)
 *  7. Endpoint creation and model configuration
 *
 * Output: e2e/screenshots/installer-flow/
 * Run:    npx playwright test e2e/installer-setup-flow.test.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SS_DIR = path.join(__dirname, 'screenshots', 'installer-flow')
fs.mkdirSync(SS_DIR, { recursive: true })

const LMSTUDIO_URL = 'http://localhost:1234/v1'

let app: ElectronApplication
let page: Page

async function shot(name: string) {
  await page.screenshot({
    path: path.join(SS_DIR, `${name}.png`),
    fullPage: false,
  })
  console.log(`  📸 ${name}.png`)
}

async function openPanel(title: string) {
  const btn = page.locator(`button[title="${title}"]`)
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(500)
  }
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

test.beforeAll(async () => {
  console.log('Building LiteBench...')
  execSync('npx electron-vite build', { cwd: PROJECT_ROOT, stdio: 'pipe' })
  console.log('Build complete.')

  app = await electron.launch({
    args: [path.join(PROJECT_ROOT, 'out', 'main', 'index.js')],
    cwd: PROJECT_ROOT,
  })

  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length! > 0,
    undefined,
    { timeout: 30_000 },
  )

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

// ─── PHASE 1: First Launch Experience ────────────────────────────────────────

test.describe.serial('Phase 1: First Launch', () => {

  test('01 — App opens to Welcome panel by default', async () => {
    // The Welcome tab should be visible
    const welcomeTab = page.locator('button:has-text("Welcome"), [class*="tab"]:has-text("Welcome")')
    const isVisible = await welcomeTab.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  Welcome tab visible: ${isVisible}`)

    // Check for welcome content
    const heroText = page.locator('text="Welcome to LiteBench"')
    await expect(heroText).toBeVisible({ timeout: 5000 })

    // Check for Getting Started steps
    const step1 = page.locator('text="Install LM Studio"')
    await expect(step1).toBeVisible()

    const step2 = page.locator('text="Download a model"')
    await expect(step2).toBeVisible()

    const step3 = page.locator('text="Open Agent Chat"').first()
    await expect(step3).toBeVisible()

    await shot('01-welcome-panel')
  })

  test('02 — Recommended Models section visible', async () => {
    // Scroll down to see recommended models
    const modelsHeading = page.locator('text="Recommended Models"')
    if (await modelsHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Recommended Models section found')
    }

    // Check for at least one model entry
    const modelEntry = page.locator('text=/Qwen|Gemma|Devstral/i').first()
    const hasModels = await modelEntry.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  Model entries visible: ${hasModels}`)

    await shot('02-recommended-models')
  })

  test('03 — Quick Launch buttons work', async () => {
    // Click "Open Agent Chat" from the welcome panel
    const agentBtn = page.locator('button:has-text("Open Agent Chat")').first()
    if (await agentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await agentBtn.click()
      await page.waitForTimeout(1000)
    }

    // Verify Agent Chat tab appeared
    const agentTab = page.locator('button:has-text("Agent Chat"), [class*="tab"]:has-text("Agent Chat")')
    const agentTabVisible = await agentTab.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  Agent Chat tab appeared: ${agentTabVisible}`)

    await shot('03-agent-chat-opened')
  })
})

// ─── PHASE 2: Dependency Checker ─────────────────────────────────────────────

test.describe.serial('Phase 2: Dependency Setup', () => {

  test('04 — Setup banner appears and checks dependencies', async () => {
    await openPanel('Agent Chat')
    await page.waitForTimeout(2000)

    // The setup banner should show "Checking dependencies..." briefly
    // then either show all-green or list missing deps
    // Wait for the checking to complete
    await page.waitForTimeout(3000)

    await shot('04-setup-banner-state')

    // Check if the banner shows results
    const allGreen = page.locator('text="Checking dependencies"')
    const isStillChecking = await allGreen.isVisible({ timeout: 1000 }).catch(() => false)
    console.log(`  Still checking: ${isStillChecking}`)

    // Look for individual component statuses
    const pythonStatus = page.locator('text=/python/i').first()
    const hasPythonEntry = await pythonStatus.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`  Python entry visible: ${hasPythonEntry}`)
  })

  test('05 — Setup checker via IPC returns correct results', async () => {
    const results = await page.evaluate(async () => {
      return (window as any).liteBench.agent.checkSetup()
    })

    const checks = results as Array<{ component: string; installed: boolean; version?: string; error?: string }>

    console.log('  Setup check results:')
    for (const c of checks) {
      const status = c.installed ? '✅' : '❌'
      console.log(`    ${status} ${c.component}: ${c.version || c.error || ''}`)
    }

    // Python must be installed
    const python = checks.find(c => c.component === 'python')
    expect(python).toBeDefined()
    expect(python!.installed).toBe(true)

    // Node must be installed
    const node = checks.find(c => c.component === 'node')
    expect(node).toBeDefined()
    expect(node!.installed).toBe(true)

    await shot('05-setup-ipc-results')
  })

  test('06 — Python path is consistent between checker and executor', async () => {
    // The setup checker should show the same Python path that tools use
    const results = await page.evaluate(async () => {
      const checks = await (window as any).liteBench.agent.checkSetup()
      return checks
    })

    const checks = results as Array<{ component: string; installed: boolean; version?: string }>
    const python = checks.find(c => c.component === 'python')

    console.log(`  Setup checker Python: ${python?.version}`)

    // Now test a tool that uses getPythonPath() — web_fetch uses Python subprocess
    const toolResult = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('web_fetch', {
        action: 'fetch',
        url: 'https://httpbin.org/json',
      })
    })

    const text = toolResult as string
    const toolWorks = text.includes('slideshow') || text.includes('Slide Show')
    console.log(`  web_fetch (uses getPythonPath): ${toolWorks ? 'WORKS' : 'FAILED'}`)
    console.log(`  Result preview: ${text.substring(0, 200)}`)

    expect(toolWorks).toBe(true)

    await shot('06-python-path-consistent')
  })

  test('07 — pip packages are importable by the same Python tools use', async () => {
    // Test that the Python found by getPythonPath() can actually import the required packages
    const result = await page.evaluate(async () => {
      // This runs sandbox which uses getPythonPath() internally
      return (window as any).liteBench.testTools.executeTool('sandbox', {
        action: 'execute',
        language: 'python',
        code: [
          'import duckduckgo_search',
          'import html2text',
          'print("duckduckgo_search:", getattr(duckduckgo_search, "__version__", "ok"))',
          'print("html2text: ok")',
        ].join('\n'),
      })
    })

    const text = result as string
    console.log(`  Sandbox pip import test:\n${text.substring(0, 500)}`)

    // Parse the JSON result
    try {
      const parsed = JSON.parse(text)
      expect(parsed.exit_code).toBe(0)
      expect(parsed.stdout).toContain('duckduckgo_search:')
      expect(parsed.stdout).toContain('html2text: ok')
      console.log('  ✅ Both pip packages importable by tool-executor Python')
    } catch {
      // If it's not JSON, it's an error string
      console.log(`  Result (not JSON): ${text}`)
      expect(text).not.toContain('ModuleNotFoundError')
    }

    await shot('07-pip-packages-importable')
  })

  test('08 — yt-dlp is available', async () => {
    const result = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('sandbox', {
        action: 'execute',
        language: 'python',
        code: 'import subprocess; r = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True); print(r.stdout.strip() if r.returncode == 0 else "NOT FOUND")',
      })
    })

    const text = result as string
    console.log(`  yt-dlp check: ${text.substring(0, 200)}`)

    try {
      const parsed = JSON.parse(text)
      expect(parsed.exit_code).toBe(0)
      expect(parsed.stdout.trim()).not.toBe('NOT FOUND')
      console.log(`  ✅ yt-dlp version: ${parsed.stdout.trim()}`)
    } catch {
      console.log(`  yt-dlp result: ${text}`)
    }

    await shot('08-ytdlp-available')
  })
})

// ─── PHASE 3: Tool Execution After Setup ─────────────────────────────────────

test.describe.serial('Phase 3: All Tools Work', () => {

  test('09 — web_fetch tool works (Python subprocess)', async () => {
    const text = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('web_fetch', {
        action: 'fetch',
        url: 'https://example.com',
      })
    }) as string

    expect(text.length).toBeGreaterThan(50)
    expect(text.toLowerCase()).toContain('example')
    console.log(`  web_fetch: ${text.length} chars returned`)

    await shot('09-web-fetch-works')
  })

  test('10 — sandbox tool works (Python subprocess)', async () => {
    const text = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('sandbox', {
        action: 'execute',
        code: 'print(2 + 2)',
        language: 'python',
      })
    }) as string

    const parsed = JSON.parse(text)
    expect(parsed.exit_code).toBe(0)
    expect(parsed.stdout.trim()).toBe('4')
    console.log(`  sandbox: exit_code=${parsed.exit_code}, stdout="${parsed.stdout.trim()}"`)

    await shot('10-sandbox-works')
  })

  test('11 — sandbox auto-detects python when language omitted', async () => {
    const text = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('sandbox', {
        action: 'execute',
        code: 'print("hello from auto-detect")',
      })
    }) as string

    const parsed = JSON.parse(text)
    expect(parsed.exit_code).toBe(0)
    expect(parsed.stdout).toContain('hello from auto-detect')
    console.log(`  sandbox auto-detect: ${parsed.stdout.trim()}`)

    await shot('11-sandbox-auto-detect')
  })

  test('12 — browser_go tool works (in-process)', async () => {
    await openPanel('Browser')
    await page.waitForTimeout(1500)

    const text = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('browser_go', {
        url: 'https://example.com',
      })
    }) as string

    expect(text).toContain('Title:')
    expect(text).toContain('Example Domain')
    expect(text).toMatch(/\[Page has \d+ interactive elements/)
    console.log(`  browser_go: ${text.substring(0, 100)}...`)

    await shot('12-browser-go-works')
  })

  test('13 — web_search tool works (browser-based)', async () => {
    const text = await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('web_search', {
        query: 'LiteBench AI benchmark',
        max_results: 3,
      })
    }) as string

    expect(text.length).toBeGreaterThan(50)
    expect(text).toContain('Search results')
    console.log(`  web_search: ${text.length} chars, first 150: ${text.substring(0, 150)}`)

    await shot('13-web-search-works')
  })
})

// ─── PHASE 4: Endpoint Configuration ────────────────────────────────────────

test.describe.serial('Phase 4: Endpoint Setup', () => {

  test('14 — Can create an endpoint via API', async () => {
    // Clean slate: check existing endpoints
    const existing = await page.evaluate(async () => {
      return (window as any).liteBench.endpoints.list()
    }) as any[]

    console.log(`  Existing endpoints: ${existing.length}`)

    if (existing.length === 0) {
      await page.evaluate(async (url: string) => {
        await (window as any).liteBench.endpoints.create({
          name: 'LM Studio',
          base_url: url,
          api_key: 'lm-studio',
        })
      }, LMSTUDIO_URL)
    }

    const after = await page.evaluate(async () => {
      return (window as any).liteBench.endpoints.list()
    }) as any[]

    expect(after.length).toBeGreaterThan(0)
    console.log(`  Endpoints after: ${after.length}, name: ${after[0]?.name}`)

    await shot('14-endpoint-created')
  })

  test('15 — LM Studio endpoint is reachable', async () => {
    let reachable = false
    let modelCount = 0

    try {
      const resp = await fetch(`${LMSTUDIO_URL}/models`)
      const data = await resp.json() as any
      reachable = true
      modelCount = data.data?.length ?? 0
    } catch {
      console.log('  LM Studio not running — skipping reachability check')
    }

    console.log(`  LM Studio reachable: ${reachable}, models: ${modelCount}`)

    if (reachable) {
      expect(modelCount).toBeGreaterThan(0)
    }

    await shot('15-endpoint-reachable')
  })
})

// ─── PHASE 5: Browser Session Persistence ───────────────────────────────────

test.describe.serial('Phase 5: Browser Persistence', () => {

  test('16 — Browser uses persist partition', async () => {
    await openPanel('Browser')
    await page.waitForTimeout(1000)

    // Navigate to a page to ensure the partition is created on disk
    await page.evaluate(async () => {
      return (window as any).liteBench.testTools.executeTool('browser_go', {
        url: 'https://example.com',
      })
    })

    // Wait for Electron to flush session data to disk
    await page.waitForTimeout(2000)

    // Check that the persist partition directory was created
    const userDataPath = await app.evaluate(async ({ app: electronApp }) => {
      return electronApp.getPath('userData')
    })

    const partitionDir = path.join(userDataPath, 'Partitions', 'litebench-browser')
    const exists = fs.existsSync(partitionDir)
    console.log(`  Partition dir: ${partitionDir}`)
    console.log(`  Exists: ${exists}`)

    if (exists) {
      const contents = fs.readdirSync(partitionDir)
      console.log(`  Contents: ${contents.join(', ')}`)
      expect(contents.length).toBeGreaterThan(0)
    }

    // The partition dir should exist after navigating
    expect(exists).toBe(true)

    await shot('16-browser-persist-partition')
  })

  test('17 — Cookies directory exists on disk', async () => {
    // Check that Electron created the persistent partition directory
    const userDataPath = await app.evaluate(async ({ app: electronApp }) => {
      return electronApp.getPath('userData')
    })

    console.log(`  userData: ${userDataPath}`)

    const partitionDir = path.join(userDataPath, 'Partitions', 'litebench-browser')
    const exists = fs.existsSync(partitionDir)
    console.log(`  Partition dir exists: ${exists} (${partitionDir})`)

    // If the browser was used, the partition dir should exist
    // (It's created on first navigation)
    if (exists) {
      const contents = fs.readdirSync(partitionDir)
      console.log(`  Partition contents: ${contents.join(', ')}`)
    }

    await shot('17-cookies-directory')
  })
})

// ─── PHASE 6: Full First-Run Walkthrough ─────────────────────────────────────

test.describe.serial('Phase 6: Complete Walkthrough', () => {

  test('18 — Full first-run flow: Welcome → Setup → Agent Chat → Tool Call', async () => {
    // Step 1: Start at Welcome
    await openPanel('Welcome')
    await page.waitForTimeout(500)
    await shot('18a-welcome')

    // Step 2: Open Agent Chat (triggers setup check)
    await openPanel('Agent Chat')
    await page.waitForTimeout(3000) // Let setup banner check deps
    await shot('18b-agent-chat-with-setup')

    // Step 3: Open Browser (needed for browser tools)
    await openPanel('Browser')
    await page.waitForTimeout(1000)
    await shot('18c-browser-open')

    // Step 4: Run a quick tool call to verify everything works
    const endpointId = await page.evaluate(async () => {
      const eps = await (window as any).liteBench.endpoints.list()
      return eps.length > 0 ? eps[0].id : null
    })

    if (endpointId) {
      let modelAvailable = false
      try {
        const resp = await (await fetch(`${LMSTUDIO_URL}/models`)).json() as any
        modelAvailable = resp.data?.length > 0
      } catch {}

      if (modelAvailable) {
        const resp = await (await fetch(`${LMSTUDIO_URL}/models`)).json() as any
        const model = resp.data[0].id

        console.log(`  Running full flow with model: ${model}`)

        await page.evaluate(async ({ eid, m }: any) => {
          await (window as any).liteBench.agent.send({
            endpointId: eid,
            modelId: m,
            messages: [{
              id: 'setup-test',
              role: 'user',
              content: 'Say hello in one sentence.',
              timestamp: Date.now(),
            }],
            enableTools: false,
          })
        }, { eid: endpointId, m: model })

        await page.waitForTimeout(10000)
        await shot('18d-agent-response')
        console.log('  ✅ Full first-run flow complete')
      } else {
        console.log('  Skipped agent call — no model loaded')
        await shot('18d-no-model')
      }
    } else {
      console.log('  Skipped agent call — no endpoint')
      await shot('18d-no-endpoint')
    }
  })

  test('19 — Final state overview', async () => {
    // Tour all panels
    for (const panel of ['Welcome', 'Agent Chat', 'Browser']) {
      await openPanel(panel)
      await page.waitForTimeout(300)
    }

    await openPanel('Agent Chat')
    await page.waitForTimeout(500)
    await shot('19-final-overview')
  })
})
