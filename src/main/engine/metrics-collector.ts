import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { BrowserWindow } from 'electron';
import { parseDocument } from 'htmlparser2';
import type { MetricResult } from '../../shared/types';
import type { Endpoint } from '../../shared/types';
import OpenAI from 'openai';

// ── HTML Validity ─────────────────────────────────────────────────────────────

function scoreHtmlValidity(html: string): MetricResult {
  const errors: string[] = [];

  try {
    const doc = parseDocument(html, {
      xmlMode: false,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    });

    // Check for critical structure
    const docText = html.toLowerCase();
    if (!docText.includes('<html')) errors.push('Missing <html> element');
    if (!docText.includes('<head')) errors.push('Missing <head> element');
    if (!docText.includes('<body')) errors.push('Missing <body> element');
    if (!docText.includes('<title')) errors.push('Missing <title> element');

    // Check for unclosed common tags (simple heuristic)
    const openDivs = (html.match(/<div/gi) ?? []).length;
    const closeDivs = (html.match(/<\/div>/gi) ?? []).length;
    if (Math.abs(openDivs - closeDivs) > 3) {
      errors.push(`Unbalanced div tags (${openDivs} open, ${closeDivs} close)`);
    }

    // Check doc was actually parsed (not empty)
    if (!doc.children || doc.children.length === 0) {
      errors.push('Empty document');
    }

    // Check for inline scripts with syntax errors (simple check: unmatched braces)
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    for (const script of scriptMatches) {
      const inner = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      const opens = (inner.match(/\{/g) ?? []).length;
      const closes = (inner.match(/\}/g) ?? []).length;
      if (Math.abs(opens - closes) > 5) {
        errors.push('Possible script syntax error (unmatched braces)');
        break;
      }
    }
  } catch (e) {
    errors.push(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const penaltyPerError = 15;
  const score = Math.max(0, 100 - errors.length * penaltyPerError);

  return {
    name: 'HTML Validity',
    score,
    weight: 1.5,
    details: errors.length > 0 ? errors.join('; ') : 'No structural errors detected',
  };
}

// ── Render Errors (via hidden BrowserView) ────────────────────────────────────

async function scoreRenderErrors(htmlPath: string): Promise<MetricResult> {
  const consoleErrors: string[] = [];

  try {
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
        // Allow local file access
        webSecurity: false,
      },
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        win.destroy();
        reject(new Error('Render timeout'));
      }, 10_000);

      win.webContents.on('console-message', (_event, level, message) => {
        // level: 0=verbose, 1=info, 2=warning, 3=error
        if (level === 3) {
          consoleErrors.push(message.substring(0, 200));
        }
      });

      win.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });

      win.webContents.once('did-fail-load', (_e, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`Load failed: ${desc} (${code})`));
      });

      win.loadFile(htmlPath);
    });

    win.destroy();
  } catch {
    // If render fails entirely, it's a serious error
    return {
      name: 'Renders Without Errors',
      score: 0,
      weight: 2,
      details: 'Failed to load in browser',
    };
  }

  const penaltyPerError = 20;
  const score = Math.max(0, 100 - consoleErrors.length * penaltyPerError);

  return {
    name: 'Renders Without Errors',
    score,
    weight: 2,
    details: consoleErrors.length > 0
      ? `${consoleErrors.length} console error(s): ${consoleErrors[0]}`
      : 'No console errors',
  };
}

// ── Responsive Layout ─────────────────────────────────────────────────────────

async function scoreResponsive(htmlPath: string): Promise<MetricResult> {
  const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  const overflows: string[] = [];

  for (const vp of viewports) {
    try {
      const win = new BrowserWindow({
        show: false,
        width: vp.width,
        height: vp.height,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          javascript: true,
          webSecurity: false,
        },
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          win.destroy();
          reject(new Error(`Viewport ${vp.name} timeout`));
        }, 8_000);

        win.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          resolve();
        });

        win.webContents.once('did-fail-load', (_e, code, desc) => {
          clearTimeout(timeout);
          reject(new Error(`Load failed: ${desc} (${code})`));
        });

        win.loadFile(htmlPath);
      });

      // Check for horizontal overflow
      const hasOverflow = await win.webContents.executeJavaScript(`
        (() => {
          const body = document.body;
          const html = document.documentElement;
          return body.scrollWidth > ${vp.width} || html.scrollWidth > ${vp.width};
        })()
      `).catch(() => false);

      if (hasOverflow) {
        overflows.push(`${vp.name} (${vp.width}px)`);
      }

      win.destroy();
    } catch {
      overflows.push(`${vp.name} (failed to test)`);
    }
  }

  const score = Math.max(0, 100 - overflows.length * 25);

  return {
    name: 'Responsive Layout',
    score,
    weight: 1,
    details: overflows.length > 0
      ? `Horizontal overflow at: ${overflows.join(', ')}`
      : 'No overflow at 375px, 768px, 1440px',
  };
}

// ── Accessibility ─────────────────────────────────────────────────────────────

function scoreAccessibility(html: string): MetricResult {
  const issues: string[] = [];

  // Check images for alt text
  const imgTags = html.match(/<img[^>]*>/gi) ?? [];
  const imgsWithoutAlt = imgTags.filter((tag) => !tag.toLowerCase().includes('alt='));
  if (imgsWithoutAlt.length > 0) {
    issues.push(`${imgsWithoutAlt.length} image(s) missing alt text`);
  }

  // Check for semantic HTML landmarks
  const lower = html.toLowerCase();
  const hasMain = lower.includes('<main') || lower.includes('role="main"');
  const hasNav = lower.includes('<nav') || lower.includes('role="navigation"');
  const hasHeader = lower.includes('<header') || lower.includes('role="banner"');

  if (!hasMain) issues.push('Missing <main> landmark');
  if (!hasNav) issues.push('Missing <nav> element');
  if (!hasHeader) issues.push('Missing <header> element');

  // Check for heading hierarchy (h1 should exist)
  if (!lower.includes('<h1')) {
    issues.push('Missing <h1> heading');
  }

  // Check links have descriptive text (no bare "click here")
  const clickHere = (html.match(/click here/gi) ?? []).length;
  if (clickHere > 0) {
    issues.push(`${clickHere} non-descriptive link(s) ("click here")`);
  }

  // Check for lang attribute on html element
  if (!lower.match(/<html[^>]*lang=/)) {
    issues.push('Missing lang attribute on <html>');
  }

  // Check for input labels
  const inputCount = (html.match(/<input/gi) ?? []).length;
  const labelCount = (html.match(/<label/gi) ?? []).length;
  if (inputCount > 0 && labelCount < inputCount) {
    issues.push(`${inputCount - labelCount} input(s) may lack labels`);
  }

  const penaltyPerIssue = 10;
  const score = Math.max(0, 100 - issues.length * penaltyPerIssue);

  return {
    name: 'Accessibility',
    score,
    weight: 1,
    details: issues.length > 0 ? issues.join('; ') : 'Good semantic structure',
  };
}

// ── Performance ───────────────────────────────────────────────────────────────

function scorePerformance(outputDir: string, html: string): MetricResult {
  const issues: string[] = [];

  // File size check
  const indexPath = join(outputDir, 'index.html');
  let totalSizeKb = 0;
  try {
    const files = readdirSync(outputDir);
    for (const f of files) {
      try {
        const stat = statSync(join(outputDir, f));
        totalSizeKb += stat.size / 1024;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  if (totalSizeKb > 500) {
    issues.push(`Total size ${totalSizeKb.toFixed(0)}KB exceeds 500KB`);
  }

  // Count external resource requests (heavy page weight)
  const externalCss = (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) ?? []).length;
  const externalJs = (html.match(/<script[^>]+src=["'][^"']*https?:/gi) ?? []).length;
  const externalFonts = (html.match(/fonts\.googleapis\.com/gi) ?? []).length;

  const totalExternal = externalCss + externalJs + externalFonts;
  if (totalExternal > 5) {
    issues.push(`${totalExternal} external resource requests (recommend ≤5)`);
  }

  // Check for large inline styles
  const inlineStyles = html.match(/style="[^"]{200,}"/gi) ?? [];
  if (inlineStyles.length > 5) {
    issues.push(`${inlineStyles.length} very long inline styles (use CSS classes)`);
  }

  // Reward for using CSS custom properties (modern, efficient)
  const usesVars = html.includes('--') && html.includes('var(');
  if (!usesVars) issues.push('No CSS custom properties detected (minor)');

  const penaltyPerIssue = 12;
  const score = Math.max(0, 100 - issues.length * penaltyPerIssue);

  return {
    name: 'Performance',
    score,
    weight: 0.75,
    details: issues.length > 0 ? issues.join('; ') : `Clean output — ${totalSizeKb.toFixed(1)}KB total`,
  };
}

// ── LLM Aesthetic Judge ───────────────────────────────────────────────────────

async function scoreLlmAesthetic(
  html: string,
  endpoint: Endpoint,
  modelId: string,
): Promise<MetricResult> {
  const JUDGE_PROMPT = `You are an expert web designer and UI/UX critic. Evaluate this HTML website on aesthetic quality, design skill, and user experience.

Score it from 0-100 where:
- 0-20: Barely functional, no styling, broken layout
- 21-40: Basic, minimal effort, poor typography or color use
- 41-60: Adequate, some styling, reasonable layout
- 61-80: Good, professional look, solid color/type choices
- 81-100: Excellent, polished, impressive design work

Consider: visual hierarchy, color harmony, typography, whitespace, responsiveness signals, modern design patterns.

Respond ONLY with a JSON object: {"score": <number>, "reasoning": "<1-2 sentences>"}`;

  const truncatedHtml = html.length > 8000 ? html.substring(0, 8000) + '\n... (truncated)' : html;

  try {
    const client = new OpenAI({
      apiKey: endpoint.api_key,
      baseURL: endpoint.base_url,
      timeout: 30_000,
    });

    const response = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: `HTML to evaluate:\n\`\`\`html\n${truncatedHtml}\n\`\`\`` },
      ],
      temperature: 0,
      max_tokens: 150,
    });

    const content = response.choices[0]?.message?.content ?? '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; reasoning?: unknown };
      const score = Math.min(100, Math.max(0, Number(parsed.score) || 50));
      return {
        name: 'LLM Aesthetic Judge',
        score,
        weight: 1.5,
        details: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI aesthetic evaluation',
      };
    }

    // Fallback: extract a number from the response
    const numMatch = content.match(/\b([0-9]{1,3})\b/);
    if (numMatch) {
      const score = Math.min(100, Math.max(0, parseInt(numMatch[1], 10)));
      return {
        name: 'LLM Aesthetic Judge',
        score,
        weight: 1.5,
        details: content.substring(0, 200),
      };
    }

    return {
      name: 'LLM Aesthetic Judge',
      score: 50,
      weight: 1.5,
      details: 'Could not parse judge response — defaulting to 50',
    };
  } catch (e) {
    return {
      name: 'LLM Aesthetic Judge',
      score: -1, // -1 = not available (judge endpoint not configured/reachable)
      weight: 1.5,
      details: `Judge unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MetricsConfig {
  /** If provided, runs LLM aesthetic judge using this endpoint + model */
  judgeEndpoint?: Endpoint;
  judgeModelId?: string;
}

/**
 * Collect all metrics for a competitor's output directory.
 * Returns MetricResult[] — scores are 0-100, weight varies per metric.
 * Score of -1 means the metric was unavailable (e.g. no judge endpoint).
 */
export async function collectMetrics(
  outputDir: string,
  config: MetricsConfig = {},
): Promise<MetricResult[]> {
  const indexPath = join(outputDir, 'index.html');

  if (!existsSync(indexPath)) {
    return [
      {
        name: 'HTML Validity',
        score: 0,
        weight: 1.5,
        details: 'No index.html found in output directory',
      },
      {
        name: 'Renders Without Errors',
        score: 0,
        weight: 2,
        details: 'No index.html found',
      },
      {
        name: 'Responsive Layout',
        score: 0,
        weight: 1,
        details: 'No index.html found',
      },
      {
        name: 'Accessibility',
        score: 0,
        weight: 1,
        details: 'No index.html found',
      },
      {
        name: 'Performance',
        score: 0,
        weight: 0.75,
        details: 'No index.html found',
      },
    ];
  }

  let html = '';
  try {
    html = readFileSync(indexPath, 'utf-8');
  } catch (e) {
    const errMsg = `Failed to read index.html: ${e instanceof Error ? e.message : String(e)}`;
    return [
      { name: 'HTML Validity', score: 0, weight: 1.5, details: errMsg },
      { name: 'Renders Without Errors', score: 0, weight: 2, details: errMsg },
      { name: 'Responsive Layout', score: 0, weight: 1, details: errMsg },
      { name: 'Accessibility', score: 0, weight: 1, details: errMsg },
      { name: 'Performance', score: 0, weight: 0.75, details: errMsg },
    ];
  }

  // Run synchronous metrics immediately
  const validityResult = scoreHtmlValidity(html);
  const accessibilityResult = scoreAccessibility(html);
  const performanceResult = scorePerformance(outputDir, html);

  // Run async metrics in parallel
  const [renderResult, responsiveResult] = await Promise.all([
    scoreRenderErrors(indexPath),
    scoreResponsive(indexPath),
  ]);

  const results: MetricResult[] = [
    validityResult,
    renderResult,
    responsiveResult,
    accessibilityResult,
    performanceResult,
  ];

  // LLM judge is optional
  if (config.judgeEndpoint && config.judgeModelId) {
    const aestheticResult = await scoreLlmAesthetic(
      html,
      config.judgeEndpoint,
      config.judgeModelId,
    );
    results.push(aestheticResult);
  }

  return results;
}

/**
 * Compute a single composite score from metric results (0-100).
 * Ignores metrics with score === -1 (unavailable).
 */
export function computeCompositeScore(metrics: MetricResult[]): number {
  const available = metrics.filter((m) => m.score >= 0);
  if (available.length === 0) return 0;

  const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
  const weightedSum = available.reduce((sum, m) => sum + m.score * m.weight, 0);

  return Math.round(weightedSum / totalWeight);
}
