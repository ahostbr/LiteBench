import { ipcMain, BrowserWindow } from 'electron';
import type { BrowserBounds } from '../browser-manager';
import {
  createBrowserSession,
  destroySession,
  navigateTo,
  goBack,
  goForward,
  reload,
  setBounds,
  showSession,
  hideSession,
  executeJS,
  screenshot,
  readPage,
  clickElement,
  typeText,
  scrollPage,
  selectOption,
  getConsoleLogs,
  getSessionUrl,
} from '../browser-manager';

function getMainWindow(): BrowserWindow {
  const wins = BrowserWindow.getAllWindows();
  if (!wins.length) throw new Error('No BrowserWindow found');
  return wins[0];
}

export function registerBrowserHandlers(): void {
  ipcMain.handle('bench:browser:create', () => {
    const win = getMainWindow();
    return createBrowserSession(win);
  });

  ipcMain.handle('bench:browser:destroy', (_event, sessionId: string) => {
    const win = getMainWindow();
    destroySession(sessionId, win);
  });

  ipcMain.handle('bench:browser:navigate', async (_event, sessionId: string, url: string) => {
    return await navigateTo(sessionId, url);
  });

  ipcMain.handle('bench:browser:back', (_event, sessionId: string) => {
    goBack(sessionId);
  });

  ipcMain.handle('bench:browser:forward', (_event, sessionId: string) => {
    goForward(sessionId);
  });

  ipcMain.handle('bench:browser:reload', (_event, sessionId: string) => {
    reload(sessionId);
  });

  ipcMain.handle('bench:browser:set-bounds', (_event, sessionId: string, bounds: BrowserBounds) => {
    setBounds(sessionId, bounds);
  });

  ipcMain.handle('bench:browser:show', (_event, sessionId: string) => {
    showSession(sessionId);
  });

  ipcMain.handle('bench:browser:hide', (_event, sessionId: string) => {
    hideSession(sessionId);
  });

  ipcMain.handle('bench:browser:execute-js', (_event, sessionId: string, code: string) => {
    return executeJS(sessionId, code);
  });

  ipcMain.handle('bench:browser:screenshot', (_event, sessionId: string) => {
    return screenshot(sessionId);
  });

  ipcMain.handle('bench:browser:read-page', (_event, sessionId: string) => {
    return readPage(sessionId);
  });

  ipcMain.handle('bench:browser:click', (_event, sessionId: string, index: number) => {
    return clickElement(sessionId, index);
  });

  ipcMain.handle('bench:browser:type', (_event, sessionId: string, text: string, index?: number) => {
    return typeText(sessionId, text, index);
  });

  ipcMain.handle('bench:browser:scroll', (
    _event,
    sessionId: string,
    direction: 'up' | 'down' | 'left' | 'right',
    amount: number,
  ) => {
    return scrollPage(sessionId, direction, amount);
  });

  ipcMain.handle('bench:browser:select', (
    _event,
    sessionId: string,
    elementIndex: number,
    optionIndex: number,
  ) => {
    return selectOption(sessionId, elementIndex, optionIndex);
  });

  ipcMain.handle('bench:browser:console-logs', (_event, sessionId: string) => {
    return getConsoleLogs(sessionId);
  });

  ipcMain.handle('bench:browser:get-url', (_event, sessionId: string) => {
    return getSessionUrl(sessionId);
  });
}
