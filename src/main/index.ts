import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'node-pty';
import { configDir, loadConfig } from './config';
import { hookSocketPath, startHookServer } from './hookServer';
import { writeHooksFile } from './hooksFile';
import { currentBranch } from './git';
import { prForBranch } from './github';
import { registerIpc } from './ipc';
import { notificationsDefault, projectByKey } from './ipc/config';
import { JiraClient, jiraEnvPath, readCreds } from './jira';
import { checkNotifications } from './menu';
import { notifyTab, shouldNotify } from './notify';
import { defaultRunner } from './preflight';
import { SessionManager } from './sessions';
import { saveState, loadState, type SavedState } from './state';
import { StatusEngine } from './status';

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
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
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

async function start(): Promise<void> {
  const [{ data: config }, { state }] = await Promise.all([loadConfig(), loadState()]);
  const hooksFile = await writeHooksFile(configDir(), process.execPath, join(import.meta.dirname, 'maple-hook.mjs'));
  const socketPath = hookSocketPath();
  let saved = state;
  let saving = Promise.resolve();
  const persist = (patch: Partial<SavedState>) => {
    saved = { ...saved, ...patch };
    const snapshot = saved;
    saving = saving.catch(() => undefined).then(() => saveState(snapshot));
    return saving;
  };
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
    save: (tabs, closedSessions) => persist({ tabs, closedSessions }),
    closedSessions: state.closedSessions,
    uuid: randomUUID,
  });
  const jira = readCreds(jiraEnvPath()).then((creds) => new JiraClient(creds));
  jira.catch(() => undefined);
  const status = new StatusEngine({
    sessions,
    getCard: async (key) => (await jira).getCard(key),
    prFor: async (worktree) => prForBranch(defaultRunner, worktree, await currentBranch(worktree)),
  });
  const stopHooks = await startHookServer(socketPath, (e) => {
    status.hook(e);
  });
  app.on('will-quit', () => {
    sessions.killAll();
    void stopHooks();
  });

  let activeTabId: string | null = null;
  const enabled = async () => saved.notifications ?? (await notificationsDefault());
  status.on('status', (s, prev) => {
    void (async () => {
      const tab = sessions.get(s.tabId);
      const focused = mainWindow?.isFocused() ?? false;
      if (tab && shouldNotify(s.dot, prev, focused, activeTabId, tab.id, await enabled())) {
        const project = await projectByKey(tab.projectKey);
        notifyTab(() => mainWindow, tab, project?.name ?? tab.projectKey);
      }
    })();
  });

  registerIpc({
    window: () => mainWindow,
    worktreeFor: (tabId) => sessions.get(tabId)?.worktreePath ?? null,
    project: projectByKey,
    sessions,
    status,
    setActiveTab: (tabId) => {
      activeTabId = tabId;
    },
    setNotifications: async (on) => {
      checkNotifications(on);
      await persist({ notifications: on });
    },
  });
  checkNotifications(await enabled());
}

void app.whenReady().then(async () => {
  await start();
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
