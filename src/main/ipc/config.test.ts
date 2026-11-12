import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import type { Fetched } from '@shared/types/app/fetched';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import { registerConfig } from './config';
import type { ZoomChange } from '@main/app/window/zoom';
import type { StartQueue } from '@main/sessions/StartQueue';

type Handler = (event: IpcMainInvokeEvent) => Promise<unknown>;

const { handle, loadConfig, setAppMenu } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  loadConfig: vi.fn(),
  setAppMenu:
    vi.fn<
      (
        reload: () => Promise<unknown>,
        setNotifications: (on: boolean) => Promise<void>,
        setZoom: (change: ZoomChange) => Promise<void>,
        reportBug: () => void,
      ) => void
    >(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/app/config/config', () => ({ loadConfig }));
vi.mock('@main/app/window/menu', () => ({ setAppMenu }));

const event = {} as IpcMainInvokeEvent;
const sessions = {} as SessionManager;
const first = { data: null, error: 'reading config: missing', fetchedAt: null };
const second = { data: null, error: null, fetchedAt: '2026-10-17T00:00:00.000Z' };
const halo: ProjectConfig = {
  name: 'Halo',
  jiraKey: 'HALO',
  jiraBoardId: 7,
  plannerDir: '/tmp/halo',
  repo: 'tahardi/halo',
  otherRepos: [],
};
const loaded = (projects: ProjectConfig[], notifications = true): Fetched<MapleConfig> => ({
  data: {
    worktreesDir: '/tmp/wts',
    vaultDir: null,
    notifications,
    backgroundWaitMinutes: 15,
    eventKeepDays: 365,
    eventMaxMegabytes: 200,
    stateBackups: 3,
    startAtOnce: 4,
    maxWorking: 8,
    maxLoadPerCore: 0.8,
    minFreeMegabytes: 2048,
    projects,
    actions: [],
  },
  error: null,
  fetchedAt: '2026-10-18T00:00:00.000Z',
});

function handler(channel: string): Handler {
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler for ${channel}`);
  }
  return call[1];
}

function deps(window: () => BrowserWindow | null = () => null) {
  return {
    window,
    worktreeFor: () => null,
    project: () => Promise.resolve(null),
    sessions,
    terminals: {} as Terminals,
    status: {} as StatusEngine,
    setActiveTab: vi.fn(),
    warnings: () => [],
    setNotifications: vi.fn(() => Promise.resolve()),
    setZoom: vi.fn(() => Promise.resolve()),
    configLoaded: vi.fn(() => Promise.resolve()),
    setLastProject: vi.fn(() => Promise.resolve()),
    lastProject: () => Promise.resolve(null),
    setSeen: () => Promise.resolve(),
    seen: () => Promise.resolve({}),
    startQueue: new EventEmitter() as StartQueue,
    prs: { latest: () => Promise.resolve({ data: null, error: null, fetchedAt: null }), refresh: () => undefined },
  };
}

function fakeWindow(destroyed: boolean) {
  const sendToWindow = vi.fn();
  const win = { isDestroyed: () => destroyed, webContents: { send: sendToWindow } } as unknown as BrowserWindow;
  return { win, sendToWindow };
}

describe('registerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfig.mockReset().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  });

  test('get serves the startup load without loading again', async () => {
    // given
    registerConfig(deps());
    // when
    const results = [await handler('config:get')(event), await handler('config:get')(event)];
    // then
    expect(results).toEqual([first, first]);
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  test('reload refreshes the cached config and notifies the window', async () => {
    // given
    const { win, sendToWindow } = fakeWindow(false);
    registerConfig(deps(() => win));
    // when
    const reloaded = await handler('config:reload')(event);
    const after = await handler('config:get')(event);
    // then
    expect(reloaded).toEqual(second);
    expect(after).toEqual(second);
    expect(sendToWindow).toHaveBeenCalledWith('config:changed', second);
  });

  test('reload hands the new config to the app before notifying the window', async () => {
    // given
    const reloadedConfig = loaded([halo]);
    loadConfig.mockReset().mockResolvedValueOnce(first).mockResolvedValueOnce(reloadedConfig);
    const { win, sendToWindow } = fakeWindow(false);
    const given = deps(() => win);
    registerConfig(given);
    // when
    await handler('config:reload')(event);
    // then
    expect(given.configLoaded).toHaveBeenCalledWith(reloadedConfig.data);
    const [handedOver] = given.configLoaded.mock.invocationCallOrder;
    const [notified] = sendToWindow.mock.invocationCallOrder;
    expect(handedOver).toBeLessThan(notified);
  });

  test.each([
    { name: 'no window', destroyed: null },
    { name: 'a destroyed window', destroyed: true },
  ])('reload skips notifying $name', async ({ destroyed }) => {
    // given
    const { win, sendToWindow } = fakeWindow(destroyed ?? false);
    registerConfig(deps(() => (destroyed === null ? null : win)));
    // when
    const reloaded = await handler('config:reload')(event);
    // then
    expect(reloaded).toEqual(second);
    expect(sendToWindow).not.toHaveBeenCalled();
  });

  test('menu reload refreshes the cache and notifies the window', async () => {
    // given
    const { win, sendToWindow } = fakeWindow(false);
    registerConfig(deps(() => win));
    const [[menuReload]] = setAppMenu.mock.calls;
    // when
    await menuReload();
    // then
    expect(await handler('config:get')(event)).toEqual(second);
    expect(sendToWindow).toHaveBeenCalledWith('config:changed', second);
  });
});

describe('registerConfig menu', () => {
  test('passes the notifications setter to the menu', async () => {
    // given
    vi.clearAllMocks();
    loadConfig.mockResolvedValue(first);
    const d = deps();
    registerConfig(d);
    const [[, setNotifications]] = setAppMenu.mock.calls;
    // when
    await setNotifications(false);
    // then
    expect(d.setNotifications).toHaveBeenCalledWith(false);
  });

  test('passes the zoom setter to the menu', async () => {
    // given
    vi.clearAllMocks();
    loadConfig.mockResolvedValue(first);
    const d = deps();
    registerConfig(d);
    const [[, , setZoom]] = setAppMenu.mock.calls;
    // when
    await setZoom('in');
    // then
    expect(d.setZoom).toHaveBeenCalledWith('in');
  });

  test('the menu report trigger tells the window', () => {
    // given
    vi.clearAllMocks();
    loadConfig.mockResolvedValue(first);
    const { win, sendToWindow } = fakeWindow(false);
    registerConfig(deps(() => win));
    const [[, , , reportBug]] = setAppMenu.mock.calls;
    // when
    reportBug();
    // then
    expect(sendToWindow).toHaveBeenCalledWith('app:reportRequested', null);
  });
});
