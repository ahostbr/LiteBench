/**
 * Agent Hard Tests — Level 2-4 difficulty.
 *
 * Tests multi-step tool chaining, data extraction, error recovery,
 * and cross-tool state management. All models scored 100% on Level 1.
 * These tests separate "can call a tool" from "can think with tools."
 *
 * Run: npx tsx e2e/agent-hard-tests.ts [model-id]
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'ai/data/trainer/agent_hard_results.jsonl');
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

const MODEL_ID = process.argv[2] || 'google/gemma-4-26b-a4b';
const MODEL_LABEL = process.argv[3] || MODEL_ID;

interface HardTestCase {
  label: string;
  level: number;
  prompt: string;
  requiredTools: string[];
  minToolCalls: number;
  validate: (result: TestResult) => { passed: boolean; reason: string };
}

interface TestResult {
  toolsCalled: string[];
  toolDetails: Array<{ name: string; args: any }>;
  toolResults: Array<{ name: string; result: string }>;
  responseText: string;
  error: string | null;
  elapsed: number;
}

const TESTS: HardTestCase[] = [
  // ── LEVEL 2: Multi-step chaining ──────────────────────────────────────────
  {
    label: 'Search → Code → Answer',
    level: 2,
    prompt:
      'Search the web for "population of Tokyo 2024". Extract the population number from the search results. ' +
      'Then run Python code in the sandbox that takes that number and calculates how many years it would take ' +
      'for Tokyo to reach 20 million people if it grows at 0.5% per year (or how many years ago it passed 20 million ' +
      'if it already has). Report the calculation result.',
    requiredTools: ['web_search', 'sandbox'],
    minToolCalls: 2,
    validate: (r) => {
      const hasSearch = r.toolsCalled.includes('web_search');
      const hasSandbox = r.toolsCalled.includes('sandbox');
      const hasNumber = /\d+/.test(r.responseText);
      const hasYear = /year/i.test(r.responseText);
      if (!hasSearch) return { passed: false, reason: 'Missing web_search call' };
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call' };
      if (!hasNumber || !hasYear) return { passed: false, reason: 'Response missing numeric result or year reference' };
      // Check sandbox got real args (not empty)
      const sandboxCall = r.toolDetails.find((t) => t.name === 'sandbox');
      if (sandboxCall && (!sandboxCall.args?.code || sandboxCall.args.code.length < 10))
        return { passed: false, reason: 'Sandbox called with empty/trivial code' };
      return { passed: true, reason: 'Search + code pipeline completed' };
    },
  },
  {
    label: 'Browse → Extract → Code',
    level: 2,
    prompt:
      'Navigate to https://example.com and read the page. Extract the exact text of the main heading. ' +
      'Then run Python code that counts the number of vowels in that heading text and prints the result. ' +
      'Tell me both the heading and the vowel count.',
    requiredTools: ['browser_go', 'sandbox'],
    minToolCalls: 2,
    validate: (r) => {
      const hasBrowse = r.toolsCalled.includes('browser_go');
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (!hasBrowse) return { passed: false, reason: 'Missing browser_go call' };
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call' };
      // "Example Domain" has 5 vowels: E, a, e, o, a, i → actually E-x-a-m-p-l-e D-o-m-a-i-n = e,a,e,o,a,i = 6
      const has6 = r.responseText.includes('6');
      const hasHeading = /example domain/i.test(r.responseText);
      if (!hasHeading) return { passed: false, reason: 'Did not extract "Example Domain" heading' };
      if (!has6) return { passed: false, reason: 'Vowel count should be 6 for "Example Domain"' };
      return { passed: true, reason: 'Correctly extracted heading and computed vowels' };
    },
  },

  // ── LEVEL 3: Conditional logic + data parsing ─────────────────────────────
  {
    label: 'Contradictory Sources',
    level: 3,
    prompt:
      'Search the web for "Python latest stable version". Then navigate to https://www.python.org/downloads/ ' +
      'and read what version is shown there. Compare the two. ' +
      'If they agree, say "AGREE: [version]". If they disagree, say "DISAGREE: search=[X] python.org=[Y]". ' +
      'You MUST use both tools — do not rely on your training knowledge.',
    requiredTools: ['web_search', 'browser_go'],
    minToolCalls: 2,
    validate: (r) => {
      const hasSearch = r.toolsCalled.includes('web_search');
      const hasBrowse = r.toolsCalled.includes('browser_go') || r.toolsCalled.includes('web_fetch');
      if (!hasSearch) return { passed: false, reason: 'Missing web_search call' };
      if (!hasBrowse) return { passed: false, reason: 'Missing browser_go/web_fetch call to python.org' };
      const hasAgree = /AGREE:/i.test(r.responseText);
      const hasDisagree = /DISAGREE:/i.test(r.responseText);
      if (!hasAgree && !hasDisagree) return { passed: false, reason: 'Response must contain AGREE: or DISAGREE:' };
      const hasVersion = /\d+\.\d+/.test(r.responseText);
      if (!hasVersion) return { passed: false, reason: 'No version number found in response' };
      return { passed: true, reason: 'Compared sources and reported result' };
    },
  },
  {
    label: 'Error Recovery',
    level: 3,
    prompt:
      'Run this Python code in the sandbox:\n```python\nimport statistics\ndata = [14, 22, 8, 19, 31, 7, 25]\n' +
      'print(f"Mean: {statistics.mean(data)}")\nprint(f"Mode: {statistics.mode(data)}")\n```\n' +
      'After running it, modify the code to also compute the median and standard deviation (rounded to 2 decimals). ' +
      'Run the updated version and report all the results.',
    requiredTools: ['sandbox'],
    minToolCalls: 2,
    validate: (r) => {
      const sandboxCalls = r.toolsCalled.filter((t) => t === 'sandbox').length;
      if (sandboxCalls < 2) return { passed: false, reason: `Need at least 2 sandbox calls, got ${sandboxCalls}` };
      const hasMean = /mean/i.test(r.responseText);
      const hasMedian = /median/i.test(r.responseText);
      const hasStdev = /stdev|standard dev/i.test(r.responseText);
      if (!hasMean) return { passed: false, reason: 'Missing mean in output' };
      if (!hasMedian) return { passed: false, reason: 'Missing median in output' };
      if (!hasStdev) return { passed: false, reason: 'Missing standard deviation in output' };
      return { passed: true, reason: 'Extended code and reported all stats' };
    },
  },
  {
    label: 'Sieve Until Correct',
    level: 3,
    prompt:
      'Write a Python function `find_primes(n)` using the Sieve of Eratosthenes. Run it with n=50. ' +
      'The output MUST be exactly: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]\n' +
      'Verify your output matches this list exactly. If it does not match, fix and re-run until it does. ' +
      'Report the final verified output.',
    requiredTools: ['sandbox'],
    minToolCalls: 1,
    validate: (r) => {
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call' };
      const expectedPrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
      // Check full response + tool results for the correct list
      const fullText = r.responseText + ' ' + r.toolResults.map((t) => t.result).join(' ');
      const has47 = fullText.includes('47');
      const has2 = fullText.includes('[2,') || fullText.includes('[2, ');
      const no1 = !fullText.includes('[1,') && !fullText.includes('[1, 2');
      if (!has47 || !has2) return { passed: false, reason: 'Output does not contain correct prime list' };
      if (!no1) return { passed: false, reason: 'Output incorrectly includes 1 as prime' };
      return { passed: true, reason: 'Sieve produced correct primes up to 50' };
    },
  },

  // ── LEVEL 4: Full pipelines ───────────────────────────────────────────────
  {
    label: 'HN Front Page Analysis',
    level: 4,
    prompt:
      'Go to https://news.ycombinator.com and read the front page. Extract the titles of the top 5 stories. ' +
      'Then write and run a Python script that takes those 5 titles (hardcoded from what you read), ' +
      'computes the average title length in characters, and identifies which title is the longest. ' +
      'Report the titles, the average length, and which one is longest.',
    requiredTools: ['browser_go', 'sandbox'],
    minToolCalls: 2,
    validate: (r) => {
      const hasBrowse = r.toolsCalled.includes('browser_go');
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (!hasBrowse) return { passed: false, reason: 'Missing browser_go to HN' };
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call for analysis' };
      const hasAvg = /average|avg|mean/i.test(r.responseText);
      const hasLongest = /longest/i.test(r.responseText);
      // Must mention actual titles (not generic text)
      const fullText = r.responseText + ' ' + r.toolResults.map((t) => t.result).join(' ');
      const hasNumbers = /\d{2,}/.test(fullText); // avg length should be 20+ chars
      if (!hasAvg) return { passed: false, reason: 'Missing average length calculation' };
      if (!hasLongest) return { passed: false, reason: 'Did not identify longest title' };
      if (!hasNumbers) return { passed: false, reason: 'No numeric results found' };
      return { passed: true, reason: 'Full HN pipeline completed with analysis' };
    },
  },
  {
    label: 'Multi-Search Synthesis',
    level: 4,
    prompt:
      'I need to compare two programming languages. Search for "Rust programming language advantages" and then ' +
      'search for "Go programming language advantages". After both searches, write and run Python code that ' +
      'creates a comparison dictionary with at least 3 advantages for each language (from your search results, ' +
      'not training knowledge) and prints it as formatted JSON. Report the comparison.',
    requiredTools: ['web_search', 'sandbox'],
    minToolCalls: 3,
    validate: (r) => {
      const searchCalls = r.toolsCalled.filter((t) => t === 'web_search').length;
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (searchCalls < 2) return { passed: false, reason: `Need 2+ web_search calls, got ${searchCalls}` };
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call' };
      const hasRust = /rust/i.test(r.responseText);
      const hasGo = /\bgo\b/i.test(r.responseText);
      const hasJSON = /\{[\s\S]*\}/.test(r.responseText) || /json/i.test(r.responseText);
      if (!hasRust || !hasGo) return { passed: false, reason: 'Missing Rust or Go in response' };
      if (!hasJSON) return { passed: false, reason: 'No JSON output found' };
      return { passed: true, reason: 'Multi-search synthesis with code completed' };
    },
  },
  {
    label: 'Live Docs → Working Code',
    level: 4,
    prompt:
      'Fetch the Python docs page at https://docs.python.org/3/library/pathlib.html. ' +
      'Using what you read there, write a Python script that: (1) creates a directory called "test_output", ' +
      '(2) creates 3 files inside it: a.txt containing "alpha", b.txt containing "beta", c.txt containing "gamma", ' +
      '(3) uses pathlib.Path.glob() to find all .txt files, (4) reads each file and prints the total character count ' +
      'across all files. Run the script and report the output.',
    requiredTools: ['sandbox'],
    minToolCalls: 1,
    validate: (r) => {
      const hasFetch = r.toolsCalled.includes('browser_go') || r.toolsCalled.includes('web_fetch');
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call' };
      // "alpha"=5 + "beta"=4 + "gamma"=5 = 14 total chars
      const fullText = r.responseText + ' ' + r.toolResults.map((t) => t.result).join(' ');
      const has14 = fullText.includes('14');
      if (!has14) return { passed: false, reason: 'Total character count should be 14 (alpha+beta+gamma)' };
      return { passed: true, reason: 'Fetched docs, wrote code, correct output' };
    },
  },
  {
    label: 'Wikipedia Data Extraction',
    level: 4,
    prompt:
      'Navigate to https://en.wikipedia.org/wiki/Turing_completeness and read the page. ' +
      'Extract the first sentence of the article (the definition). ' +
      'Then run Python code that counts the number of words in that sentence and determines ' +
      'the 3 longest words. Report: the sentence, word count, and the 3 longest words.',
    requiredTools: ['browser_go', 'sandbox'],
    minToolCalls: 2,
    validate: (r) => {
      const hasBrowse = r.toolsCalled.includes('browser_go');
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (!hasBrowse) return { passed: false, reason: 'Missing browser_go to Wikipedia' };
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox call' };
      const hasTuring = /turing/i.test(r.responseText);
      const hasWordCount = /\d+\s*word/i.test(r.responseText);
      const hasLongest = /longest|long/i.test(r.responseText);
      if (!hasTuring) return { passed: false, reason: 'Response should reference Turing' };
      if (!hasWordCount) return { passed: false, reason: 'Missing word count' };
      if (!hasLongest) return { passed: false, reason: 'Missing longest words analysis' };
      return { passed: true, reason: 'Wikipedia extraction + analysis pipeline completed' };
    },
  },
  {
    label: 'Chain: Search → Browse → Code → Report',
    level: 4,
    prompt:
      'Search for "most popular JavaScript framework 2024". From the search results, identify the #1 framework. ' +
      'Then navigate to that framework\'s official website and read the main tagline/description. ' +
      'Finally, run Python code that takes the framework name and tagline, generates a JSON object with keys ' +
      '"name", "tagline", "tagline_word_count", and "name_uppercase", and prints it. ' +
      'Report the final JSON.',
    requiredTools: ['web_search', 'browser_go', 'sandbox'],
    minToolCalls: 3,
    validate: (r) => {
      const hasSearch = r.toolsCalled.includes('web_search');
      const hasBrowse = r.toolsCalled.includes('browser_go');
      const hasSandbox = r.toolsCalled.includes('sandbox');
      if (!hasSearch) return { passed: false, reason: 'Missing web_search' };
      if (!hasBrowse) return { passed: false, reason: 'Missing browser_go to framework site' };
      if (!hasSandbox) return { passed: false, reason: 'Missing sandbox for JSON generation' };
      const hasJSON = /\{[\s\S]*name[\s\S]*tagline/i.test(r.responseText) ||
                      /json/i.test(r.responseText);
      if (!hasJSON) return { passed: false, reason: 'No JSON output with name+tagline found' };
      return { passed: true, reason: 'Full 4-tool chain completed' };
    },
  },
];

let app: ElectronApplication;
let page: Page;

async function launchApp(): Promise<void> {
  console.log('Launching app (pre-built)...');
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

  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
    }
  });

  const browserBtn = page.locator('button[title="Browser"]');
  if (await browserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await browserBtn.click();
    await page.waitForTimeout(1000);
  }
}

async function runTest(modelId: string, prompt: string, timeoutMs = 180_000): Promise<TestResult> {
  const start = Date.now();
  const result = await page.evaluate(async ({ prompt, model, timeout }: any) => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) return { toolsCalled: [], toolDetails: [], toolResults: [], responseText: '', error: 'No endpoints' };

    const events: any[] = [];
    let done = false;

    const { conversationId } = await (window as any).liteBench.agent.send({
      endpointId: eps[0].id,
      modelId: model,
      messages: [{ id: '1', role: 'user', content: prompt, timestamp: Date.now() }],
      enableTools: true,
    });

    const unsub = (window as any).liteBench.agent.onStreamEvent(conversationId, (event: any) => {
      events.push(event);
      if (event.type === 'done' || event.type === 'error') done = true;
    });

    const s = Date.now();
    while (!done && Date.now() - s < timeout) {
      await new Promise(r => setTimeout(r, 200));
    }
    unsub();

    return {
      toolsCalled: events.filter(e => e.type === 'tool_call_start').map(e => e.toolCall?.name || '?'),
      toolDetails: events.filter(e => e.type === 'tool_call_start').map(e => ({
        name: e.toolCall?.name,
        args: e.toolCall?.arguments ?? e.toolCall?.args ?? null,
      })),
      toolResults: events.filter(e => e.type === 'tool_call_done').map(e => ({
        name: e.toolName ?? '?',
        result: (typeof e.result === 'string' ? e.result : JSON.stringify(e.result))?.slice(0, 500) ?? '',
      })),
      responseText: events.filter(e => e.type === 'text_delta').map(e => e.content).join(''),
      error: events.find(e => e.type === 'error')?.message || null,
    };
  }, { prompt, model: modelId, timeout: timeoutMs });

  return { ...result, elapsed: Date.now() - start };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AGENT HARD TESTS — Multi-step Tool Intelligence           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Model: ${MODEL_LABEL} (${MODEL_ID})\n`);

  await launchApp();

  const results: any[] = [];
  const levelScores = new Map<number, { passed: number; total: number }>();

  for (const test of TESTS) {
    console.log(`  [${'★'.repeat(test.level)}${'☆'.repeat(4 - test.level)}] ${test.label}`);
    console.log(`    Prompt: "${test.prompt.slice(0, 70)}..."`);

    const result = await runTest(MODEL_ID, test.prompt);
    const validation = test.validate(result);

    console.log(`    Tools: [${result.toolsCalled.join(', ')}] (${result.toolsCalled.length} calls)`);
    console.log(`    Response: ${result.responseText.length} chars`);
    console.log(`    Time: ${(result.elapsed / 1000).toFixed(1)}s`);
    console.log(`    Result: ${validation.passed ? '✅ PASS' : '❌ FAIL'} — ${validation.reason}`);

    if (!validation.passed) {
      console.log(`    Response preview: "${result.responseText.slice(0, 120).replace(/\n/g, ' ')}..."`);
    }
    console.log();

    if (!levelScores.has(test.level)) levelScores.set(test.level, { passed: 0, total: 0 });
    const ls = levelScores.get(test.level)!;
    ls.total++;
    if (validation.passed) ls.passed++;

    results.push({
      model: MODEL_ID,
      modelLabel: MODEL_LABEL,
      test: test.label,
      level: test.level,
      toolsCalled: result.toolsCalled,
      toolCount: result.toolsCalled.length,
      responseLength: result.responseText.length,
      passed: validation.passed,
      reason: validation.reason,
      elapsed: result.elapsed,
      timestamp: new Date().toISOString(),
    });
  }

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const totalPassed = results.filter((r) => r.passed).length;
  const totalTests = results.length;
  const pct = ((totalPassed / totalTests) * 100).toFixed(0);

  for (const [level, scores] of [...levelScores.entries()].sort()) {
    const lpct = ((scores.passed / scores.total) * 100).toFixed(0);
    console.log(`  Level ${level} ${'★'.repeat(level)}${'☆'.repeat(4 - level)}: ${scores.passed}/${scores.total} (${lpct}%)`);
  }
  console.log();
  console.log(`  TOTAL: ${totalPassed}/${totalTests} (${pct}%)`);
  console.log(`  Model: ${MODEL_LABEL}`);

  const grade = totalPassed === totalTests ? 'S' :
    parseInt(pct) >= 90 ? 'A' : parseInt(pct) >= 70 ? 'B' :
    parseInt(pct) >= 50 ? 'C' : parseInt(pct) >= 30 ? 'D' : 'F';
  console.log(`  Grade: ${grade}`);

  for (const r of results) {
    fs.appendFileSync(LOG_FILE, JSON.stringify(r) + '\n');
  }
  console.log(`\n  Results saved to ${LOG_FILE}`);
  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
