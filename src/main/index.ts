import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerIpc } from './ipc';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'Maple',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = window;
  window.on('closed', () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  registerIpc({ window: () => mainWindow, worktreeFor: () => null, project: () => null });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
