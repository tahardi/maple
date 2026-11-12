import { randomUUID } from 'node:crypto';
import { cpus, freemem, loadavg } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node-pty';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import {
  configDir,
  DEFAULT_MAX_LOAD_PER_CORE,
  DEFAULT_MAX_WORKING,
  DEFAULT_MIN_FREE_MEGABYTES,
  DEFAULT_START_AT_ONCE,
  DEFAULT_START_GAP_SECONDS,
  DEFAULT_WAIT_MINUTES,
  loadConfig,
} from '@main/app/config/config';
import { hookSocketPath, startHookServer } from '@main/sessions/hooks/hookServer';
import { claimInstance } from '@main/app/instance';
import { defaultRunner } from '@main/app/preflight';
import { writeHooksFile } from '@main/sessions/hooks/hooksFile';
import { findWorktrees } from '@main/git/findWorktrees';
import { currentBranch, headSha } from '@main/git/repoIdentity';
import { PrPoller } from '@main/github/PrPoller';
import { registerIpc } from '@main/ipc';
import { notificationsDefault, projectByKey } from '@main/app/config/configCache';
import { closeNeedsConfirm } from '@main/sessions/closeNeedsConfirm';
import { recordActions } from '@main/ipc/validated';
import { JiraClient } from '@main/jira/JiraClient';
import { tapDoneSnapshots } from '@main/vault/tapDoneSnapshots';
import { jiraEnvPath, readCreds } from '@main/jira/readCreds';
import { appLogger, setLogSecrets, startLogging } from '@main/app/log/log';
import { readBuildInfo } from '@main/app/buildInfo';
import { logUncaught } from '@main/app/log/logUncaught';
import { askDeleteToday } from '@main/events/askDeleteToday';
import { eventLog, startEventLog } from '@main/events/eventLog';
import { prEvents } from '@main/events/PrEvents';
import { pruneLimits } from '@main/events/pruneEvents';
import { EventRecorder } from '@main/events/EventRecorder';
import { uiActionRecorder } from '@main/events/uiActions';
import { checkNotifications } from '@main/app/window/menu';
import { notifyTab, shouldNotify } from '@main/app/notify';
import { restoreTabs } from '@main/sessions/restore';
import { reloadOnCrash } from '@main/app/window/reloadOnCrash';
import { lockDown, webPreferences } from '@main/app/window/security';
import { showStartupFailure } from '@main/app/startupFailure';
import { SessionManager } from '@main/sessions/SessionManager';
import { Terminals } from '@main/sessions/Terminals';
import { STATE_BACKUPS } from '@main/app/state/backupState';
import { saveState, loadState, type SavedState } from '@main/app/state/state';
import { StartQueue } from '@main/sessions/StartQueue';
import { StatusEngine } from '@main/sessions/StatusEngine';
import { AutoSync } from '@main/sessions/AutoSync';
import { endTmux, writeTmuxConf } from '@main/sessions/tmux';
import { hasTranscript, transcriptOffset } from '@main/sessions/transcripts/transcripts';
import { windowTitle } from '@main/app/window/windowTitle';
import { zoomLevel, type ZoomChange } from '@main/app/window/zoom';
import { zoomKey } from '@main/app/window/zoomKey';

let mainWindow: BrowserWindow | null = null;
let quitting = false;

type Zoom = { level: () => number; set: (change: ZoomChange) => Promise<void> };

function createWindow(zoom: Zoom): Promise<void> {
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
  reloadOnCrash(window.webContents);
  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomLevel(zoom.level());
  });
  window.webContents.on('before-input-event', (event, input) => {
    const change = zoomKey(input);
    if (change) {
      event.preventDefault();
      void zoom.set(change);
    }
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

  return rendererUrl ? window.loadURL(rendererUrl) : window.loadFile(indexFile);
}

async function start(): Promise<Zoom> {
  startLogging(!app.isPackaged);
  const build = await readBuildInfo(import.meta.dirname);
  appLogger.info('app', 'started', { version: app.getVersion(), sha: build.sha, built: build.date });
  logUncaught();
  process.on('uncaughtException', (err) => {
    dialog.showErrorBox('A JavaScript error occurred in the main process', err.stack ?? err.message);
  });
  const loaded = await loadConfig();
  let config = loaded.data;
  const { state, warning } = await loadState(configDir(), config?.stateBackups ?? STATE_BACKUPS);
  startEventLog({
    limits: pruneLimits(config),
    askDeleteToday: (bytes) => askDeleteToday((options) => dialog.showMessageBox(options), bytes),
  });
  const hooksFile = await writeHooksFile(configDir(), process.execPath, join(import.meta.dirname, 'maple-hook.mjs'));
  const tmuxConf = await writeTmuxConf(configDir());
  const socketPath = hookSocketPath();
  const creds = readCreds(jiraEnvPath());
  void creds.then(
    (c) => {
      setLogSecrets([c.token, Buffer.from(`${c.email}:${c.token}`).toString('base64')]);
    },
    () => undefined,
  );
  const jiraEnv = await creds.then(
    (c): Record<string, string> => ({ JIRA_SITE: c.site, JIRA_EMAIL: c.email, JIRA_TOKEN: c.token }),
    () => ({}),
  );
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
    snapshotRoot: join(configDir(), 'snapshots'),
    save: (tabs, closedSessions) => persist({ tabs, closedSessions }),
    closedSessions: state.closedSessions,
    uuid: randomUUID,
    hasTranscript,
    tmuxConf,
    endTmux,
    sessionEnv: jiraEnv,
  });
  const terminals = new Terminals({ spawn });
  const jira = creds.then((c) => new JiraClient(c));
  jira.catch(() => undefined);
  const getCard = tapDoneSnapshots(
    async (key) => (await jira).getCard(key),
    (key) => sessions.sessionOf(key),
  );
  const prPoller = new PrPoller({
    tabs: () => sessions.list(),
    project: projectByKey,
    branch: currentBranch,
    run: defaultRunner,
  });
  const status = new StatusEngine({
    sessions,
    getCard: prEvents.tapCard(getCard, () => sessions.list()),
    prFor: prEvents.tapPr(
      (tabId, worktree) => prPoller.fresh(tabId, worktree),
      () => sessions.list(),
    ),
    waitLimitMs: () => (config?.backgroundWaitMinutes ?? DEFAULT_WAIT_MINUTES) * 60_000,
  });
  const startQueue = new StartQueue({
    sessions,
    status,
    limits: () => ({
      startAtOnce: config?.startAtOnce ?? DEFAULT_START_AT_ONCE,
      maxWorking: config?.maxWorking ?? DEFAULT_MAX_WORKING,
      maxLoadPerCore: config?.maxLoadPerCore ?? DEFAULT_MAX_LOAD_PER_CORE,
      minFreeMegabytes: config?.minFreeMegabytes ?? DEFAULT_MIN_FREE_MEGABYTES,
      startGapSeconds: config?.startGapSeconds ?? DEFAULT_START_GAP_SECONDS,
    }),
    load: () => ({ loadAverage: loadavg()[0], cores: cpus().length, freeBytes: freemem() }),
    queued: state.queue,
    save: (queue) => persist({ queue }),
  });
  let stopQueue: () => void = () => undefined;
  const recorder = new EventRecorder({ sessions, status, transcriptOffset: (id) => transcriptOffset(id), headSha });
  const stopHooks = await startHookServer(socketPath, (e) => {
    status.hook(e);
    recorder.hook(e);
    prEvents.hook(e);
  });
  const autoSync = new AutoSync({
    sessions,
    status,
    getCard,
    pr: (tabId, worktree) => prPoller.latest(tabId, worktree),
  });
  const stopAutoSync = autoSync.start();
  const stopPrPoller = prPoller.start();
  status.on('status', (s, prev) => {
    prPoller.dotChanged(s.dot, prev);
  });
  app.on('will-quit', (event) => {
    event.preventDefault();
    stopQueue();
    stopAutoSync();
    stopPrPoller();
    sessions.killAll();
    terminals.closeAll();
    void stopHooks();
    void recorder.drain().then(() => {
      app.exit(0);
    });
  });
  const restore = ({ worktreesDir }: MapleConfig) =>
    restoreTabs(state, sessions, (key) => findWorktrees(worktreesDir, key));
  const restored = config ? await restore(config) : { restored: 0, warnings: [] };
  if (config) {
    stopQueue = startQueue.start();
  }
  if (warning !== null) {
    appLogger.warn('restore', 'loading state', { warning });
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

  recordActions(
    uiActionRecorder({
      tab: (id) => sessions.get(id),
      actions: () => config?.actions ?? [],
      closeNeedsConfirm: (tabId, force) => closeNeedsConfirm(status.statuses(), tabId, force),
      append: (refs, data) => eventLog().append('ui.action', refs, data),
    }),
  );
  const setZoom = async (change: ZoomChange) => {
    const contents = mainWindow?.webContents;
    if (!contents) {
      return;
    }
    const zoom = zoomLevel(contents.getZoomLevel(), change);
    contents.setZoomLevel(zoom);
    await persist({ zoom });
  };
  registerIpc({
    window: () => mainWindow,
    worktreeFor: (tabId) => sessions.get(tabId)?.worktreePath ?? null,
    project: projectByKey,
    sessions,
    terminals,
    status,
    startQueue,
    prs: prPoller,
    jira,
    jiraCreds: creds,
    setActiveTab: (tabId) => {
      activeTabId = tabId;
      autoSync.activate(tabId);
    },
    setNotifications: async (on) => {
      checkNotifications(on);
      await persist({ notifications: on });
    },
    warnings: () => warnings,
    configLoaded: async (next) => {
      if (next === null) {
        return;
      }
      const firstLoad = config === null;
      config = next;
      if (firstLoad) {
        warnings.push(...(await restore(next)).warnings);
        stopQueue = startQueue.start();
      }
    },
    setLastProject: (key) => persist({ lastProject: key }),
    lastProject: () => Promise.resolve(saved.lastProject),
    setSeen: (seen) => persist({ seen }),
    seen: () => Promise.resolve(saved.seen),
    setZoom,
  });
  app.on('before-quit', (event) => {
    quitting = !event.defaultPrevented;
  });
  checkNotifications(await enabled());
  return { level: () => saved.zoom, set: setZoom };
}

if (claimInstance(app)) {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.focus();
  });
  void app
    .whenReady()
    .then(async () => {
      const zoom = await start();
      await createWindow(zoom);
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow(zoom);
        }
      });
    })
    .catch((err: unknown) => {
      showStartupFailure(err, {
        showErrorBox: (title, content) => {
          dialog.showErrorBox(title, content);
        },
        quit: () => {
          app.quit();
        },
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
