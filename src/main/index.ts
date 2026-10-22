import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node-pty';
import { configDir, loadConfig } from '@main/app/config';
import { hookSocketPath, startHookServer } from '@main/sessions/hookServer';
import { claimInstance } from '@main/app/instance';
import { writeHooksFile } from '@main/sessions/hooksFile';
import { currentBranch, findWorktree } from '@main/git/git';
import { prForBranch } from '@main/github/pr';
import { registerIpc } from '@main/ipc';
import { notificationsDefault, projectByKey } from '@main/ipc/config';
import { JiraClient, jiraEnvPath, readCreds } from '@main/jira/jira';
import { appLogger, logUncaught, startLogging } from '@main/app/log';
import { checkNotifications } from '@main/app/menu';
import { notifyTab, shouldNotify } from '@main/app/notify';
import { defaultRunner } from '@main/app/preflight';
import { restoreTabs } from '@main/sessions/restore';
import { lockDown, webPreferences } from '@main/app/security';
import { SessionManager } from '@main/sessions/sessions';
import { Terminals } from '@main/sessions/terminals';
import { saveState, loadState, type SavedState } from '@main/app/state';
import { StatusEngine } from '@main/sessions/status';
import { endTmux, writeTmuxConf } from '@main/sessions/tmux';
import { hasTranscript } from '@main/sessions/transcripts';
import { windowTitle } from '@main/app/windowTitle';
import { zoomLevel } from '@main/app/zoom';

let mainWindow: BrowserWindow | null = null;
let quitting = false;

function createWindow(zoom: () => number): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: windowTitle(process.env),
    webPreferences: webPreferences(join(import.meta.dirname, '../preload/index.cjs'), app.isPackaged),
  });

  mainWindow = window;
  const rendererUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const indexFile = join(import.meta.dirname, '../renderer/index.html');
  lockDown(window.webContents, rendererUrl ?? pathToFileURL(indexFile).href);
  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomLevel(zoom());
  });
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

async function start(): Promise<() => number> {
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
  const terminals = new Terminals({ spawn });
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
    terminals.closeAll();
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
    terminals,
    status,
    setActiveTab: (tabId) => {
      activeTabId = tabId;
    },
    setNotifications: async (on) => {
      checkNotifications(on);
      await persist({ notifications: on });
    },
    warnings: () => warnings,
    setLastProject: (key) => persist({ lastProject: key }),
    lastProject: () => Promise.resolve(saved.lastProject),
    setZoom: async (change) => {
      const contents = mainWindow?.webContents;
      if (!contents) {
        return;
      }
      const zoom = zoomLevel(contents.getZoomLevel(), change);
      contents.setZoomLevel(zoom);
      await persist({ zoom });
    },
  });
  app.on('before-quit', (event) => {
    quitting = !event.defaultPrevented;
  });
  checkNotifications(await enabled());
  return () => saved.zoom;
}

if (claimInstance(app)) {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.focus();
  });
  void app.whenReady().then(async () => {
    const zoom = await start();
    createWindow(zoom);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(zoom);
      }
    });
  });
} else {
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
