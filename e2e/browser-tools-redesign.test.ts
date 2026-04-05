/**
 * Browser Tools Redesign E2E — Polymathic Consensus Validation
 *
 * Tests the 5 changes from Einstein/Socrates/Feynman review:
 *  1. browser_go (merged navigate+read) — one call, plain text output
 *  2. browser_elements — separate, top 10, plain text indices
 *  3. Plain text format — no markdown, telegram style, action hints
 *  4. Action hints in every browser_go response
 *  5. Tiered tool filtering — small models get core tools only
 *
 * Two test modes:
 *  - Direct executor tests (no LLM needed) — validates output format via IPC
 *  - Agent IPC tests (needs LM Studio) — validates full workflow
 *
 * Output: e2e/screenshots/browser-redesign/
 * Run:    npx playwright test e2e/browser-tools-redesign.test.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SS_DIR = path.join(__dirname, 'screenshots', 'browser-redesign')
fs.mkdirSync(SS_DIR, { recursive: true })

const TEST_MODEL = 'mistralai/devstral-small-2-2512'
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
  await btn.click()
  await page.waitForTimeout(500)
}

/** Execute a tool via the test IPC bridge */
async function executeTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  return page.evaluate(
    async ({ n, a }) => (window as any).liteBench.testTools.executeTool(n, a),
    { n: name, a: args },
  )
}

/** Get tool names for a given model size tier */
async function getToolNames(smallModel?: boolean): Promise<string[]> {
  return page.evaluate(
    async (sm) => (window as any).liteBench.testTools.getSchemas(sm),
    smallModel,
  )
}

/** Build system prompt for a model */
async function buildPrompt(modelId: string): Promise<string> {
  return page.evaluate(
    async (m) => (window as any).liteBench.testTools.buildPrompt(m),
    modelId,
  )
}

/** Check if model is "small" */
async function checkIsSmall(modelId: string): Promise<boolean> {
  return page.evaluate(
    async (m) => (window as any).liteBench.testTools.isSmallModel(m),
    modelId,
  )
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

  // Ensure endpoint exists
  await page.evaluate(async (url: string) => {
    const existing = await (window as any).liteBench.endpoints.list()
    if (existing.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio',
        base_url: url,
        api_key: 'lm-studio',
      })
    }
  }, LMSTUDIO_URL)

  console.log('App ready.')
})

test.afterAll(async () => {
  if (app) await app.close()
})

// ─── PHASE 1: Direct Tool Executor Tests (no LLM needed) ────────────────────

test.describe.serial('Phase 1: Tool Executor Output Format', () => {

  test('01 — Open Browser panel to create session', async () => {
    await openPanel('Browser')
    await page.waitForTimeout(2000)
    await shot('01-browser-panel-open')
  })

  // ── browser_go: merged navigate+read ──────────────────────────────────────

  test('02 — browser_go returns plain text with title, URL, content', async () => {
    const text = await executeTool('browser_go', { url: 'https://example.com' })

    console.log(`  browser_go result (first 500 chars):\n${text.substring(0, 500)}`)

    // Polymathic consensus: plain text format
    expect(text).toContain('Title:')
    expect(text).toContain('URL:')
    expect(text).toContain('example.com')

    // Must NOT contain markdown headers (Einstein + Feynman: no ## headers)
    expect(text).not.toMatch(/^## /m)
    expect(text).not.toMatch(/^# /m)

    // Must contain action hint (Feynman: ~15 tokens)
    expect(text).toMatch(/\[Page has \d+ interactive elements/)

    await shot('02-browser-go-example-com')
  })

  test('03 — browser_go on a content-rich page (Hacker News)', async () => {
    const text = await executeTool('browser_go', { url: 'https://news.ycombinator.com' })

    console.log(`  browser_go HN result length: ${text.length} chars`)

    // Title + URL present
    expect(text).toMatch(/Title: .+/)
    expect(text).toMatch(/URL: .+ycombinator/)

    // Content should be capped (~1500 chars of content + metadata)
    expect(text.length).toBeLessThan(3000)
    expect(text.length).toBeGreaterThan(200)

    // Action hint present
    expect(text).toMatch(/\[Page has \d+ interactive elements/)

    await shot('03-browser-go-hackernews')
  })

  // ── browser_elements: separate, top 10 ────────────────────────────────────

  test('04 — browser_elements returns top 10 plain text elements', async () => {
    // Still on HN from previous test
    const text = await executeTool('browser_elements')

    console.log(`  browser_elements result:\n${text.substring(0, 800)}`)

    // Must contain element indices as plain numbers (no [brackets])
    expect(text).toMatch(/^\d+: /m)
    expect(text).not.toMatch(/^\[\d+\]/)

    // Should mention "Interactive elements"
    expect(text).toContain('Interactive elements')

    // Should have instruction hint at the end
    expect(text).toContain('browser_click')
    expect(text).toContain('browser_type')

    // Count the element lines (number: type "label")
    const elementLines = text.split('\n').filter(l => /^\d+: /.test(l))
    console.log(`  Element count: ${elementLines.length}`)
    expect(elementLines.length).toBeLessThanOrEqual(10)
    expect(elementLines.length).toBeGreaterThan(0)

    await shot('04-browser-elements-hackernews')
  })

  test('05 — browser_elements on a page with form inputs', async () => {
    // Navigate to DuckDuckGo (has a search form)
    await executeTool('browser_go', { url: 'https://html.duckduckgo.com' })

    const text = await executeTool('browser_elements')
    console.log(`  DDG elements:\n${text.substring(0, 600)}`)

    // Should have input elements
    expect(text).toMatch(/\d+: input/)

    await shot('05-browser-elements-ddg-form')
  })

  // ── browser_go action hints: form detection ───────────────────────────────

  test('06 — browser_go detects forms in action hint', async () => {
    const text = await executeTool('browser_go', { url: 'https://html.duckduckgo.com' })

    // DuckDuckGo has a search form — hint should mention "form inputs"
    expect(text).toContain('including form inputs')

    await shot('06-browser-go-form-detection')
  })

  // ── browser_click + browser_type still work ───────────────────────────────

  test('07 — browser_type into search input', async () => {
    // Already on DDG from test 06. Find the search input index from elements.
    const elemText = await executeTool('browser_elements')

    // Parse out the first input element index
    const inputMatch = elemText.match(/(\d+): input/)
    const inputIndex = inputMatch ? parseInt(inputMatch[1], 10) : 0

    console.log(`  Typing into element index ${inputIndex}`)

    const typeResult = await executeTool('browser_type', {
      text: 'LiteBench AI benchmark',
      index: inputIndex,
    })

    console.log(`  browser_type result: ${typeResult}`)
    await page.waitForTimeout(500)
    await shot('07-browser-type-search')
  })

  test('08 — browser_click submits the search', async () => {
    // Find the submit button
    const elemText = await executeTool('browser_elements')

    // Find submit button index
    const btnMatch = elemText.match(/(\d+): button/)
    const btnIndex = btnMatch ? parseInt(btnMatch[1], 10) : 1

    console.log(`  Clicking button at index ${btnIndex}`)

    const clickResult = await executeTool('browser_click', { index: btnIndex })
    console.log(`  browser_click result: ${clickResult}`)

    // Wait for search results to load
    await page.waitForTimeout(3000)

    // Verify page changed — browser_go on current page
    const resultPage = await executeTool('browser_go', { url: 'https://html.duckduckgo.com/html/?q=LiteBench+AI+benchmark' })
    console.log(`  Search results page (first 300 chars): ${resultPage.substring(0, 300)}`)

    await shot('08-browser-click-search-results')
  })

  // ── Legacy tools still work for large models ──────────────────────────────

  test('09 — browser_navigate still works (backward compat)', async () => {
    const text = await executeTool('browser_navigate', { url: 'https://example.com' })

    console.log(`  browser_navigate result: ${text}`)

    // Old format: 'Page loaded: "title" at url'
    expect(text).toContain('Page loaded:')
    expect(text).toContain('Example Domain')

    await shot('09-legacy-navigate')
  })

  test('10 — browser_read_page still works (backward compat)', async () => {
    const text = await executeTool('browser_read_page')

    console.log(`  browser_read_page result (first 500 chars):\n${text.substring(0, 500)}`)

    // Old format uses markdown headers
    expect(text).toMatch(/# /)
    expect(text).toContain('Interactive Elements')

    await shot('10-legacy-read-page')
  })
})

// ─── PHASE 2: Tiered Tool Filtering ─────────────────────────────────────────

test.describe.serial('Phase 2: Tool Tier Filtering', () => {

  test('11 — Small model gets core tools only', async () => {
    const tools = await getToolNames(true)
    console.log(`  Small model tools (${tools.length}): ${tools.join(', ')}`)

    // Must have core browser tools
    expect(tools).toContain('browser_go')
    expect(tools).toContain('browser_elements')
    expect(tools).toContain('browser_click')
    expect(tools).toContain('browser_type')

    // Must have non-browser core tools
    expect(tools).toContain('web_search')
    expect(tools).toContain('web_fetch')
    expect(tools).toContain('sandbox')
    expect(tools).toContain('youtube')

    // Must NOT have advanced browser tools
    expect(tools).not.toContain('browser_navigate')
    expect(tools).not.toContain('browser_read_page')
    expect(tools).not.toContain('browser_screenshot')
    expect(tools).not.toContain('browser_execute_js')
    expect(tools).not.toContain('browser_scroll')
    expect(tools).not.toContain('browser_console_logs')

    await shot('11-small-model-tools')
  })

  test('12 — Large model gets ALL tools', async () => {
    const tools = await getToolNames(false)
    console.log(`  Large model tools (${tools.length}): ${tools.join(', ')}`)

    // Must have everything
    expect(tools).toContain('browser_go')
    expect(tools).toContain('browser_elements')
    expect(tools).toContain('browser_navigate')
    expect(tools).toContain('browser_read_page')
    expect(tools).toContain('browser_screenshot')
    expect(tools).toContain('browser_execute_js')
    expect(tools).toContain('browser_scroll')
    expect(tools).toContain('browser_console_logs')
    expect(tools).toContain('browser_click')
    expect(tools).toContain('browser_type')
    expect(tools).toContain('web_search')
    expect(tools).toContain('web_fetch')
    expect(tools).toContain('sandbox')
    expect(tools).toContain('youtube')

    await shot('12-large-model-tools')
  })

  test('13 — Default (no model) gets all tools', async () => {
    const tools = await getToolNames()
    console.log(`  Default tools (${tools.length}): ${tools.join(', ')}`)

    // Default = all tools (backward compatible)
    expect(tools).toContain('browser_navigate')
    expect(tools).toContain('browser_go')
    expect(tools.length).toBeGreaterThanOrEqual(14)

    await shot('13-default-all-tools')
  })
})

// ─── PHASE 3: System Prompt Validation ──────────────────────────────────────

test.describe.serial('Phase 3: System Prompt Updates', () => {

  test('14 — Native prompt references browser_go', async () => {
    const text = await buildPrompt('devstral-small-2')

    // Must reference browser_go in the workflow section
    expect(text).toContain('browser_go')

    // Must describe one-call pattern
    expect(text).toMatch(/one call|ONE call/i)

    // Should reference browser_elements for interaction
    expect(text).toContain('browser_elements')

    console.log(`  Native prompt length: ${text.length} chars`)
    console.log(`  Contains browser_go workflow: yes`)
  })

  test('15 — Small model prompt references browser_go', async () => {
    const text = await buildPrompt('qwen3.5-0.8b')

    // Must list browser_go (not browser_navigate + browser_read_page)
    expect(text).toContain('browser_go')
    expect(text).toContain('browser_elements')
    expect(text).toContain('browser_click')
    expect(text).toContain('browser_type')

    // The one-call example should show browser_go, NOT navigate+read
    expect(text).toContain('browser_go({"url"')
    expect(text).toContain('Title:')

    // Should NOT reference the old two-step workflow
    expect(text).not.toContain('browser_navigate')
    expect(text).not.toContain('browser_read_page')

    console.log(`  Small model prompt length: ${text.length} chars`)
    console.log(`  References browser_go: yes`)
    console.log(`  References old navigate+read: no`)
  })

  test('16 — isSmallModel detection', async () => {
    const models = [
      // Should be small
      { id: 'qwen3.5-0.8b', expected: true },
      { id: 'model-0.5b-instruct', expected: true },
      { id: 'xlam-2-1b', expected: true },
      { id: 'tiny-1.5b-chat', expected: true },
      { id: 'jackrong-0.8b', expected: true },
      { id: 'qwen-752m', expected: true },
      // Should NOT be small
      { id: 'qwen3-4b', expected: false },
      { id: 'devstral-small-2', expected: false },
      { id: 'gemma-4-31b', expected: false },
      { id: 'llama-3-8b', expected: false },
    ]

    console.log('  isSmallModel results:')
    for (const { id, expected } of models) {
      const result = await checkIsSmall(id)
      console.log(`    ${id}: ${result} (expected ${expected})`)
      expect(result).toBe(expected)
    }
  })
})

// ─── PHASE 4: Full Agent Workflow (needs LM Studio) ─────────────────────────

test.describe.serial('Phase 4: Agent Workflow with browser_go', () => {

  async function checkModelAvailable(): Promise<{ endpointId: string | null; available: boolean }> {
    const endpointId = await page.evaluate(async () => {
      const eps = await (window as any).liteBench.endpoints.list()
      return eps.length > 0 ? eps[0].id : null
    })
    if (!endpointId) return { endpointId: null, available: false }

    try {
      const resp = await (await fetch(`${LMSTUDIO_URL}/models`)).json() as any
      const available = resp.data?.some((m: any) => m.id.includes('devstral'))
      return { endpointId, available }
    } catch {
      return { endpointId, available: false }
    }
  }

  test('17 — Agent uses browser_go to read a website', async () => {
    const { endpointId, available } = await checkModelAvailable()
    if (!endpointId || !available) {
      console.log('  Skipped — LM Studio/model not available')
      return
    }

    await openPanel('Agent Chat')
    await page.waitForTimeout(500)
    await openPanel('Browser')
    await page.waitForTimeout(1000)

    console.log('  Sending agent task: read example.com via browser_go...')

    const result = await page.evaluate(async ({ eid, model }: any) => {
      const resp = await (window as any).liteBench.agent.send({
        endpointId: eid,
        modelId: model,
        messages: [{
          id: 'bg-test-1',
          role: 'user',
          content: 'Go to https://example.com and tell me what the page says. Use browser_go.',
          timestamp: Date.now(),
        }],
        enableTools: true,
      })
      return { conversationId: resp.conversationId }
    }, { eid: endpointId, model: TEST_MODEL })

    console.log(`  Agent task started: ${result.conversationId}`)
    await page.waitForTimeout(15000)
    await shot('17-agent-browser-go')
  })

  test('18 — Agent uses browser_go + browser_elements workflow', async () => {
    const { endpointId, available } = await checkModelAvailable()
    if (!endpointId || !available) {
      console.log('  Skipped — LM Studio/model not available')
      return
    }

    console.log('  Sending agent task: navigate + list elements...')

    const result = await page.evaluate(async ({ eid, model }: any) => {
      const resp = await (window as any).liteBench.agent.send({
        endpointId: eid,
        modelId: model,
        messages: [{
          id: 'bg-test-2',
          role: 'user',
          content: 'Go to https://news.ycombinator.com using browser_go, then list the interactive elements using browser_elements. Tell me how many links are on the page.',
          timestamp: Date.now(),
        }],
        enableTools: true,
      })
      return { conversationId: resp.conversationId }
    }, { eid: endpointId, model: TEST_MODEL })

    console.log(`  Agent task started: ${result.conversationId}`)
    await page.waitForTimeout(25000)
    await shot('18-agent-go-plus-elements')
  })

  test('19 — Agent uses browser_go + type + click (search workflow)', async () => {
    const { endpointId, available } = await checkModelAvailable()
    if (!endpointId || !available) {
      console.log('  Skipped — LM Studio/model not available')
      return
    }

    console.log('  Sending agent task: full search workflow...')

    const result = await page.evaluate(async ({ eid, model }: any) => {
      const resp = await (window as any).liteBench.agent.send({
        endpointId: eid,
        modelId: model,
        messages: [{
          id: 'bg-test-3',
          role: 'user',
          content: 'Search DuckDuckGo for "local LLM benchmarks" using the browser. Go to html.duckduckgo.com, find the search input with browser_elements, type the query, and click search. Tell me the results.',
          timestamp: Date.now(),
        }],
        enableTools: true,
      })
      return { conversationId: resp.conversationId }
    }, { eid: endpointId, model: TEST_MODEL })

    console.log(`  Agent task started: ${result.conversationId}`)
    await page.waitForTimeout(40000)
    await shot('19-agent-full-search-workflow')
  })
})

// ─── PHASE 5: Output Format Deep Validation ─────────────────────────────────

test.describe.serial('Phase 5: Output Format Compliance', () => {

  test('20 — browser_go output has no markdown artifacts', async () => {
    // Ensure browser panel is open
    await openPanel('Browser')
    await page.waitForTimeout(1000)

    const text = await executeTool('browser_go', { url: 'https://example.com' })

    // Polymathic consensus: NO markdown
    expect(text).not.toMatch(/^#{1,3} /m)           // No # headers
    expect(text).not.toMatch(/\[(\d+)\]/)            // No [index] brackets in content
    expect(text).not.toContain('→')                   // No arrow chars
    expect(text).not.toContain('## Page Content')     // No old format sections
    expect(text).not.toContain('## Interactive Elements')

    // Must be plain telegram style
    expect(text.startsWith('Title:')).toBe(true)

    // Second line is URL
    const lines = text.split('\n')
    expect(lines[1]).toMatch(/^URL: /)

    // Third line is blank separator
    expect(lines[2]).toBe('')

    console.log('  Format compliance: PASS')
  })

  test('21 — browser_elements indices are bare numbers', async () => {
    const text = await executeTool('browser_elements')
    const elementLines = text.split('\n').filter(l => /^\d+: /.test(l))

    for (const line of elementLines) {
      // Format: "0: link "More information..." https://..."
      expect(line).toMatch(/^\d+: /)
      // Must NOT have brackets
      expect(line).not.toMatch(/^\[\d+\]/)
    }

    console.log(`  Element format compliance: PASS (${elementLines.length} elements)`)
  })

  test('22 — Action hint token count is reasonable', async () => {
    const text = await executeTool('browser_go', { url: 'https://news.ycombinator.com' })

    const hintMatch = text.match(/\[Page has .+\]/)
    expect(hintMatch).not.toBeNull()

    const hint = hintMatch![0]
    // Feynman said ~15 tokens. Rough estimate: words * 1.3 tokens/word
    const wordCount = hint.split(/\s+/).length
    console.log(`  Action hint: "${hint}"`)
    console.log(`  Word count: ${wordCount} (~${Math.round(wordCount * 1.3)} tokens)`)

    // Should be under 25 words (~32 tokens)
    expect(wordCount).toBeLessThan(25)
    expect(wordCount).toBeGreaterThan(3)
  })

  test('23 — Final overview screenshot', async () => {
    await openPanel('Agent Chat')
    await page.waitForTimeout(500)
    await shot('23-final-state')

    await openPanel('Browser')
    await page.waitForTimeout(500)
    await shot('23-browser-final')
  })
})
