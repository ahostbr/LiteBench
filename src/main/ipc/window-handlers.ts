import { BrowserWindow, ipcMain } from 'electron';

const WINDOW_MAXIMIZE_CHANGE = 'bench:window:maximize-change';

export function registerWindowHandlers(): void {
  ipcMain.on('bench:window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('bench:window:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.on('bench:window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('bench:window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
}

export function bindWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send(WINDOW_MAXIMIZE_CHANGE, true);
  });
  window.on('unmaximize', () => {
    window.webContents.send(WINDOW_MAXIMIZE_CHANGE, false);
  });
}
