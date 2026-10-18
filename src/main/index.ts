import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { spawn } from 'node-pty';
import { configDir, loadConfig } from './config';
import { hookSocketPath, startHookServer } from './hookServer';
import { writeHooksFile } from './hooksFile';
import { registerIpc } from './ipc';
import { SessionManager } from './sessions';
import { saveState, loadState } from './state';

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

async function startSessions(): Promise<SessionManager> {
  const [{ data: config }, { state }] = await Promise.all([loadConfig(), loadState()]);
  const hooksFile = await writeHooksFile(configDir(), process.execPath, join(import.meta.dirname, 'maple-hook.mjs'));
  const socketPath = hookSocketPath();
  const stopHooks = await startHookServer(socketPath, () => undefined);
  let saving = Promise.resolve();
  const sessions = new SessionManager({
    spawn,
    config: () => {
      if (!config) {
        throw new Error('starting session: config is not loaded');
      }
      return config;
    },
    hooksFile,
    socketPath,
    save: (tabs, closedSessions) => {
      saving = saving.catch(() => undefined).then(() => saveState({ ...state, tabs, closedSessions }));
      return saving;
    },
    closedSessions: state.closedSessions,
    uuid: randomUUID,
  });
  app.on('will-quit', () => {
    sessions.killAll();
    void stopHooks();
  });
  return sessions;
}

void app.whenReady().then(async () => {
  const sessions = await startSessions();
  registerIpc({
    window: () => mainWindow,
    worktreeFor: (tabId) => sessions.get(tabId)?.worktreePath ?? null,
    project: () => null,
    sessions,
  });
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
