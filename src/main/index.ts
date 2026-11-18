import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { cpus, freemem, loadavg } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, Notification } from 'electron';
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
import { findWorktrees } from '@main/git/findWorktrees';
import { currentBranch, headSha } from '@main/git/repoIdentity';
import { PrPoller } from '@main/github/PrPoller';
import { registerIpc } from '@main/ipc';
import { notificationsDefault, projectByKey } from '@main/app/config/configCache';
import { closeNeedsConfirm } from '@main/sessions/closeNeedsConfirm';
import { recordActions } from '@main/ipc/recordActions';
import { JiraClient } from '@main/jira/JiraClient';
import { tapDoneSnapshots } from '@main/vault/tapDoneSnapshots';
import { vaultWatcher } from '@main/vault/vaultWatcher';
import { emit } from '@main/ipc/emit';
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
import { notifyTab } from '@main/app/notify/notify';
import { notifyIfNeeded, type NotifyDeps } from '@main/app/notify/notifyIfNeeded';
import { restoreTabs } from '@main/sessions/restore';
import { reloadOnCrash } from '@main/app/window/reloadOnCrash';
import { lockDown, webPreferences } from '@main/app/window/security';
import { showStartupFailure } from '@main/app/startupFailure';
import { SessionManager } from '@main/sessions/SessionManager';
import { Terminals } from '@main/sessions/Terminals';
import { STATE_BACKUPS } from '@main/app/state/backupState';
import { loadState, saveState } from '@main/app/state/state';
import { createStateStore } from '@main/app/state/stateStore';
import { createConfigGate } from '@main/app/config/configGate';
import { StartQueue } from '@main/sessions/StartQueue';
import { StatusEngine } from '@main/sessions/StatusEngine';
import { AutoSync } from '@main/sessions/AutoSync';
import { endTmux, writeTmuxConf } from '@main/sessions/tmux';
import { transcriptOffset } from '@main/sessions/transcripts/transcripts';
import { windowTitle } from '@main/app/window/windowTitle';
import { createZoom, type Zoom } from '@main/app/window/zoom/windowZoom';
import { zoomKey } from '@main/app/window/zoom/zoomKey';
import { fallbackRunner } from '@main/remote/fallbackRunner';
import { vmHome, type Runner } from '@main/remote/runner';
import { vmFindingsDir, vmTmuxConf } from '@main/remote/vmPaths';
import { SshRunner } from '@main/remote/sshRunner';
import { errorText } from '@shared/errors/errorText';

let mainWindow: BrowserWindow | null = null;
let quitting = false;

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
  const { state, warning, readOnly } = await loadState(configDir(), loaded.data?.stateBackups ?? STATE_BACKUPS);
  const warnings: string[] = warning === null ? [] : [warning];
  const remote = loaded.data?.remote ?? null;
  const ssh = remote ? new SshRunner(remote, configDir()) : null;
  const runner: Runner = ssh ?? fallbackRunner();
  const home = vmHome(remote);
  const tmuxConf = vmTmuxConf(home);
  const prepareVm = async (): Promise<string | null> => {
    try {
      const made = await runner.exec(['mkdir', '-p', vmFindingsDir(home)]);
      if (made.code !== 0) {
        throw new Error(`creating findings dir: ${made.stderr.trim()}`);
      }

      await writeTmuxConf(runner, home);
      return null;
    } catch (err) {
      appLogger.warn('remote', 'failed', { operation: 'prepareVm', error: errorText(err) });
      return `preparing VM: ${errorText(err)}`;
    }
  };
  const touch = (): void => {
    new Notification({ title: 'Maple', body: 'Touch your YubiKey to connect Maple to the VM' }).show();
  };
  const reconnect = async (): Promise<void> => {
    if (ssh && (await ssh.connect(touch))) {
      await prepareVm();
    }
  };
  let stopKeepAlive: () => void = () => undefined;
  let connected = ssh === null && loaded.data !== null;
  if (ssh) {
    try {
      const started = await ssh.connect(touch);
      connected = true;
      appLogger.info('remote', 'connected', { operation: 'start', reused: !started });
    } catch (err) {
      warnings.push(`connecting to VM: ${errorText(err)}`);
      appLogger.warn('remote', 'failed', { operation: 'start', error: errorText(err) });
    }
    stopKeepAlive = ssh.keepAlive({
      touch,
      restarted: () => {
        appLogger.info('remote', 'connected', { operation: 'keepAlive', reused: false });
        void prepareVm();
      },
      failed: (err) => {
        appLogger.warn('remote', 'failed', { operation: 'keepAlive', error: errorText(err) });
      },
    });
  }
  let stopQueue: () => void = () => undefined;
  const gate = createConfigGate(
    loaded.data,
    async ({ worktreesDir }) => {
      await restoreTabs(state, sessions, (key) => findWorktrees(worktreesDir, key));
      stopQueue = startQueue.start();
    },
    async ({ worktreesDir }) => {
      await restoreTabs({ ...state, tabs: sessions.keptTabs().map((k) => k.tab) }, sessions, (key) =>
        findWorktrees(worktreesDir, key),
      );
    },
  );
  const config = gate.current;
  startEventLog({
    limits: pruneLimits(config()),
    askDeleteToday: (bytes) => askDeleteToday((options) => dialog.showMessageBox(options), bytes),
  });
  const findingsDir = join(configDir(), 'findings');
  await mkdir(findingsDir, { recursive: true });
  const prepared = connected ? await prepareVm() : null;
  if (prepared !== null) {
    warnings.push(prepared);
  }
  const socketPath = hookSocketPath();
  const creds = readCreds(jiraEnvPath());
  void creds.then(
    (c) => {
      setLogSecrets([c.token, Buffer.from(`${c.email}:${c.token}`).toString('base64')]);
    },
    () => undefined,
  );
  const store = createStateStore(state, saveState, readOnly);
  const sessions = new SessionManager({
    config: () => {
      const current = config();
      if (!current) {
        throw new Error('starting session: config is not loaded');
      }
      return current;
    },
    save: (tabs, closedSessions) => store.patch({ tabs, closedSessions }),
    closedSessions: state.closedSessions,
    uuid: randomUUID,
    tmuxConf,
    endTmux: (name) => endTmux(runner, name),
    reconnect,
    runner,
    home,
  });
  const terminals = new Terminals({ runner });
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
    waitLimitMs: () => (config()?.backgroundWaitMinutes ?? DEFAULT_WAIT_MINUTES) * 60_000,
  });
  const startQueue = new StartQueue({
    sessions,
    status,
    limits: () => ({
      startAtOnce: config()?.startAtOnce ?? DEFAULT_START_AT_ONCE,
      maxWorking: config()?.maxWorking ?? DEFAULT_MAX_WORKING,
      maxLoadPerCore: config()?.maxLoadPerCore ?? DEFAULT_MAX_LOAD_PER_CORE,
      minFreeMegabytes: config()?.minFreeMegabytes ?? DEFAULT_MIN_FREE_MEGABYTES,
      startGapSeconds: config()?.startGapSeconds ?? DEFAULT_START_GAP_SECONDS,
    }),
    load: () => ({ loadAverage: loadavg()[0], cores: cpus().length, freeBytes: freemem() }),
    queued: state.queue,
    save: (queue) => store.patch({ queue }),
  });
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
    stopKeepAlive();
    stopAutoSync();
    stopPrPoller();
    sessions.killAll();
    terminals.closeAll();
    void stopHooks();
    void recorder.drain().then(() => {
      app.exit(0);
    });
  });
  await gate.start();
  if (warning !== null) {
    appLogger.warn('restore', 'loading state', { warning });
  }

  let activeTabId: string | null = null;
  const enabled = async () => store.current().notifications ?? (await notificationsDefault());
  const notifyDeps: NotifyDeps = {
    tab: (tabId) => sessions.get(tabId),
    focused: () => mainWindow?.isFocused() ?? false,
    activeTabId: () => activeTabId,
    enabled,
    project: projectByKey,
    notify: (tab, projectName) => {
      notifyTab(() => mainWindow, tab, projectName);
    },
  };
  status.on('status', (s, prev) => void notifyIfNeeded(notifyDeps, s, prev));

  recordActions(
    uiActionRecorder({
      tab: (id) => sessions.get(id) ?? sessions.keptTabs().find((k) => k.tab.id === id)?.tab ?? null,
      actions: () => config()?.actions ?? [],
      closeNeedsConfirm: (tabId, force) => closeNeedsConfirm(status.statuses(), tabId, force),
      append: (refs, data) => eventLog().append('ui.action', refs, data),
    }),
  );
  const zoom = createZoom(
    () => mainWindow?.webContents ?? null,
    () => store.current().zoom,
    (level) => store.patch({ zoom: level }),
  );
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
    watchVault: vaultWatcher(() => {
      emit(mainWindow, 'vault', 'onChanged');
    }, appLogger),
    findingsDir,
    decisionsDir: join(configDir(), 'decisions'),
    setActiveTab: (tabId) => {
      activeTabId = tabId;
      autoSync.activate(tabId);
    },
    setNotifications: async (on) => {
      checkNotifications(on);
      await store.patch({ notifications: on });
    },
    warnings: () => warnings,
    configLoaded: gate.loaded,
    setLastProject: (key) => store.patch({ lastProject: key }),
    lastProject: () => Promise.resolve(store.current().lastProject),
    setSeen: (seen) => store.patch({ seen }),
    seen: () => Promise.resolve(store.current().seen),
    setZoom: zoom.set,
    runner,
    home,
  });
  app.on('before-quit', (event) => {
    quitting = !event.defaultPrevented;
  });
  checkNotifications(await enabled());
  return zoom;
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
