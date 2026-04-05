/**
 * Quick Gemma 4 31B test — longer timeout
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
let app: ElectronApplication;
let page: Page;

async function main() {
  console.log('Launching...');
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
  await page.waitForTimeout(1500);

  // Ensure endpoint
  await page.evaluate(async () => {
    const eps = await (window as any).liteBench.endpoints.list();
    if (eps.length === 0) {
      await (window as any).liteBench.endpoints.create({
        name: 'LM Studio', base_url: 'http://localhost:1234/v1', api_key: 'lm-studio',
      });
    }
  });

  // Open browser panel
  const browserBtn = page.locator('button[title="Browser"]');
  if (await browserBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await browserBtn.click();
    await page.waitForTimeout(1000);
  }

  const tests = [
    'Navigate the browser to https://example.com and read the page title.',
    'Search the web for "artificial intelligence" and list the top 3 results.',
    'Use the sandbox to run this Python code: print(2 + 2)',
  ];

  for (const prompt of tests) {
    console.log(`\nTest: "${prompt.slice(0, 60)}..."`);

    const result = await page.evaluate(async ({ prompt, timeout }: any) => {
      const eps = await (window as any).liteBench.endpoints.list();
      const events: any[] = [];
      let done = false;

      const { conversationId } = await (window as any).liteBench.agent.send({
        endpointId: eps[0].id,
        modelId: 'gemma-4-31b-it',
        messages: [{ id: '1', role: 'user', content: prompt, timestamp: Date.now() }],
        enableTools: true,
      });

      const unsub = (window as any).liteBench.agent.onStreamEvent(conversationId, (event: any) => {
        events.push(event);
        if (event.type === 'done' || event.type === 'error') done = true;
      });

      const s = Date.now();
      while (!done && Date.now() - s < timeout) {
        await new Promise(r => setTimeout(r, 500));
      }
      unsub();

      return {
        toolsCalled: events.filter(e => e.type === 'tool_call_start').map(e => e.toolCall?.name || '?'),
        responseText: events.filter(e => e.type === 'text_delta').map(e => e.content).join(''),
        error: events.find(e => e.type === 'error')?.message || null,
        isDone: done,
      };
    }, { prompt, timeout: 120_000 });  // 2 minute timeout for 31B

    console.log(`  Tools: [${result.toolsCalled.join(', ')}]`);
    console.log(`  Response: ${result.responseText.length} chars — "${result.responseText.slice(0, 150).replace(/\n/g, ' ')}"`);
    console.log(`  Done: ${result.isDone}, Error: ${result.error || 'none'}`);
  }

  await app.close();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
