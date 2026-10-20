import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node-pty';
import { configDir, loadConfig } from './config';
import { hookSocketPath, startHookServer } from './hookServer';
import { writeHooksFile } from './hooksFile';
import { currentBranch, findWorktree } from './git';
import { prForBranch } from './github';
import { registerIpc } from './ipc';
import { notificationsDefault, projectByKey } from './ipc/config';
import { JiraClient, jiraEnvPath, readCreds } from './jira';
import { appLogger, logUncaught, startLogging } from './log';
import { checkNotifications } from './menu';
import { notifyTab, shouldNotify } from './notify';
import { defaultRunner } from './preflight';
import { restoreTabs } from './restore';
import { lockDown, webPreferences } from './security';
import { SessionManager } from './sessions';
import { saveState, loadState, type SavedState } from './state';
import { StatusEngine } from './status';
import { endTmux, writeTmuxConf } from './tmux';
import { hasTranscript } from './transcripts';

let mainWindow: BrowserWindow | null = null;
let quitting = false;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'Maple',
    webPreferences: webPreferences(join(import.meta.dirname, '../preload/index.cjs'), app.isPackaged),
  });

  mainWindow = window;
  const rendererUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const indexFile = join(import.meta.dirname, '../renderer/index.html');
  lockDown(window.webContents, rendererUrl ?? pathToFileURL(indexFile).href);
  window.on('close', (event) => {
    if (!quitting && process.platform !== 'darwin') {
      event.preventDefault();
      app.quit();
    }
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(indexFile);
  }
}

async function start(): Promise<void> {
  startLogging(!app.isPackaged);
  logUncaught();
  process.on('uncaughtException', (err) => {
    dialog.showErrorBox('A JavaScript error occurred in the main process', err.stack ?? err.message);
  });
  const [{ data: config }, { state, warning }] = await Promise.all([loadConfig(), loadState()]);
  const hooksFile = await writeHooksFile(configDir(), process.execPath, join(import.meta.dirname, 'maple-hook.mjs'));
  const tmuxConf = await writeTmuxConf(configDir());
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
    hasTranscript,
    tmuxConf,
    endTmux,
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
  const restored = config
    ? await restoreTabs(state, sessions, (key) => findWorktree(config.worktreesDir, key))
    : { restored: 0, warnings: [] };
  if (warning !== null) {
    appLogger.warn('restore', 'state unreadable', { warning });
  }
  const warnings = [...(warning === null ? [] : [warning]), ...restored.warnings];

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
    warnings: () => warnings,
  });
  app.on('before-quit', (event) => {
    quitting = !event.defaultPrevented;
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
