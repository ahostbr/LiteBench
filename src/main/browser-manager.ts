import { BrowserWindow, WebContentsView } from 'electron';
import { randomUUID } from 'crypto';
import { DOM_INDEX_SCRIPT, getClickScript, getTypeScript, getScrollScript, getSelectScript } from './browser-dom-helper';

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserSession {
  view: WebContentsView;
  logs: string[];
}

const sessions = new Map<string, BrowserSession>();

export function createBrowserSession(parentWindow: BrowserWindow): string {
  const id = randomUUID();

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:litebench-browser',
    },
  });

  // Collect console logs from the page
  view.webContents.on('console-message', (_event, _level, message) => {
    const session = sessions.get(id);
    if (session) {
      session.logs.push(message);
      // 500 entries per session is ~50KB worst case — acceptable for a dev tool
      if (session.logs.length > 500) {
        session.logs.splice(0, session.logs.length - 500);
      }
    }
  });

  parentWindow.contentView.addChildView(view);
  sessions.set(id, { view, logs: [] });

  return id;
}

export function destroySession(id: string, parentWindow: BrowserWindow): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    parentWindow.contentView.removeChildView(session.view);
    session.view.webContents.close();
  } catch {
    // Already destroyed
  }
  sessions.delete(id);
}

export async function navigateTo(id: string, url: string): Promise<{ url: string; title: string }> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  // Ensure protocol
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  // Wait for page to finish loading (with timeout and error handling)
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };

    const timer = setTimeout(finish, 15_000); // 15s timeout — resolve anyway

    session.view.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      finish();
    });

    session.view.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        // Resolve instead of reject — let the agent see the error page
        console.warn(`[browser] Navigation failed: ${errorDescription} (${errorCode})`);
        resolve();
      }
    });

    session.view.webContents.loadURL(target);
  });

  // Small delay for JS-heavy pages to settle
  await new Promise((r) => setTimeout(r, 500));

  return {
    url: session.view.webContents.getURL(),
    title: session.view.webContents.getTitle() || 'Untitled',
  };
}

export function goBack(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  if (session.view.webContents.canGoBack()) {
    session.view.webContents.goBack();
  }
}

export function goForward(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  if (session.view.webContents.canGoForward()) {
    session.view.webContents.goForward();
  }
}

export function reload(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.view.webContents.reload();
}

export function setBounds(id: string, bounds: BrowserBounds): void {
  const session = sessions.get(id);
  if (!session) return;
  session.view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  });
}

export function showSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.view.setVisible(true);
}

export function hideSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.view.setVisible(false);
}

export async function executeJS(id: string, code: string): Promise<unknown> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  return session.view.webContents.executeJavaScript(code);
}

export async function screenshot(id: string): Promise<string> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  const image = await session.view.webContents.capturePage();
  return image.toPNG().toString('base64');
}

export async function readPage(id: string): Promise<unknown> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  return session.view.webContents.executeJavaScript(DOM_INDEX_SCRIPT);
}

export async function clickElement(id: string, index: number): Promise<unknown> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  return session.view.webContents.executeJavaScript(getClickScript(index));
}

export async function typeText(id: string, text: string, index?: number): Promise<unknown> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  return session.view.webContents.executeJavaScript(getTypeScript(text, index));
}

export async function scrollPage(
  id: string,
  direction: 'up' | 'down' | 'left' | 'right',
  amount: number,
): Promise<unknown> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  return session.view.webContents.executeJavaScript(getScrollScript(direction, amount));
}

export async function selectOption(id: string, elementIndex: number, optionIndex: number): Promise<unknown> {
  const session = sessions.get(id);
  if (!session) throw new Error(`No browser session: ${id}`);
  return session.view.webContents.executeJavaScript(getSelectScript(elementIndex, optionIndex));
}

export function getConsoleLogs(id: string): string[] {
  const session = sessions.get(id);
  if (!session) return [];
  return [...session.logs];
}

export function getSessionUrl(id: string): string {
  const session = sessions.get(id);
  if (!session) return '';
  return session.view.webContents.getURL();
}

export function destroyAllSessions(parentWindow: BrowserWindow): void {
  for (const id of sessions.keys()) {
    destroySession(id, parentWindow);
  }
}

// ── Single Session Enforcement ──────────────────────────────────────────────
// Only ONE browser session exists — the visible Browser panel.
// Agent tools MUST use this session. No invisible sessions allowed.

/** Get the single active session ID, or null if browser panel isn't open */
export function getActiveSessionId(): string | null {
  const ids = Array.from(sessions.keys());
  return ids.length > 0 ? ids[0] : null;
}

/** List all active session IDs */
export function listSessions(): string[] {
  return Array.from(sessions.keys());
}
