import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { join } from 'path';
import { closeDatabase, initializeDatabase } from './db';
import { registerBenchmarksHandlers } from './ipc/benchmarks-handlers';
import { registerAgentHandlers } from './ipc/agent-handlers';
import { registerBrowserHandlers } from './ipc/browser-handlers';
import { registerEndpointsHandlers } from './ipc/endpoints-handlers';
import { registerSuitesHandlers } from './ipc/suites-handlers';
import { registerPtyHandlers, destroyAllPtySessions } from './ipc/pty-handlers';
import { registerTestToolsHandlers } from './ipc/test-tools-handlers';
import {
  bindWindowStateEvents,
  registerWindowHandlers,
} from './ipc/window-handlers';

let mainWindow: BrowserWindow | null = null;
let isSpanned = false;
let preSpanBounds: Electron.Rectangle | null = null;

function getUnionBounds(): Electron.Rectangle {
  const displays = screen.getAllDisplays();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  bindWindowStateEvents(mainWindow);

  // Multi-monitor span IPC
  ipcMain.on('bench:window:span-all-monitors', () => {
    if (!mainWindow || isSpanned) return;
    preSpanBounds = mainWindow.getBounds();
    const union = getUnionBounds();
    mainWindow.setMinimumSize(1, 1);
    mainWindow.setBounds(union);
    isSpanned = true;
    mainWindow.webContents.send('bench:window:span-change', true);
  });

  ipcMain.on('bench:window:restore-span', () => {
    if (!mainWindow || !isSpanned) return;
    if (preSpanBounds) mainWindow.setBounds(preSpanBounds);
    mainWindow.setMinimumSize(1080, 720);
    isSpanned = false;
    preSpanBounds = null;
    mainWindow.webContents.send('bench:window:span-change', false);
  });

  ipcMain.handle('bench:window:is-spanned', () => isSpanned);
  ipcMain.handle('bench:window:display-count', () => screen.getAllDisplays().length);

  screen.on('display-removed', () => {
    if (isSpanned && mainWindow) {
      const primary = screen.getPrimaryDisplay();
      mainWindow.setBounds(primary.workArea);
      mainWindow.setMinimumSize(1080, 720);
      isSpanned = false;
      preSpanBounds = null;
      mainWindow.webContents.send('bench:window:span-change', false);
    }
  });

  // Zoom controls
  function applyZoom(pct: number): void {
    if (!mainWindow) return;
    mainWindow.webContents.setZoomFactor(pct / 100);
  }

  function setAndPersistZoom(pct: number): void {
    const clamped = Math.max(50, Math.min(200, pct));
    // Store in localStorage via renderer (no config store in LiteBench main)
    applyZoom(clamped);
    mainWindow?.webContents.send('bench:window:zoom-change', clamped);
  }

  ipcMain.handle('bench:window:get-zoom', () => {
    return Math.round((mainWindow?.webContents.getZoomFactor() ?? 1) * 100);
  });

  ipcMain.handle('bench:window:set-zoom', (_event, payload: { zoom: number }) => {
    setAndPersistZoom(payload.zoom);
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (!input.control || input.type !== 'keyDown') return;
    const current = Math.round((mainWindow?.webContents.getZoomFactor() ?? 1) * 100);
    if (input.key === '=' || input.key === '+') {
      _event.preventDefault();
      setAndPersistZoom(current + 5);
    } else if (input.key === '-') {
      _event.preventDefault();
      setAndPersistZoom(current - 5);
    } else if (input.key === '0') {
      _event.preventDefault();
      setAndPersistZoom(100);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  const window = createMainWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.litebench.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const dbPath = initializeDatabase();
  console.log('[LiteBench] Database initialized at', dbPath);

  registerWindowHandlers();
  registerEndpointsHandlers();
  registerSuitesHandlers();
  registerBenchmarksHandlers();
  registerAgentHandlers();
  registerPtyHandlers();
  registerBrowserHandlers();
  registerTestToolsHandlers();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  destroyAllPtySessions();
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
