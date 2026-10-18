import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import type { Fetched, MapleConfig, ProjectConfig } from '@shared/types';
import { notificationsDefault, projectByKey, registerConfig } from './config';

type Handler = (event: IpcMainInvokeEvent) => Promise<unknown>;

const { handle, loadConfig, setAppMenu } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  loadConfig: vi.fn(),
  setAppMenu: vi.fn<(reload: () => Promise<unknown>, setNotifications: (on: boolean) => Promise<void>) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../config', () => ({ loadConfig }));
vi.mock('../menu', () => ({ setAppMenu }));

const event = {} as IpcMainInvokeEvent;
const sessions = {} as SessionManager;
const first = { data: null, error: 'reading config: missing', fetchedAt: null };
const second = { data: null, error: null, fetchedAt: '2026-10-17T00:00:00.000Z' };
const halo: ProjectConfig = { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 7, plannerDir: '/tmp/halo' };
const dig: ProjectConfig = { name: 'Dig Days', jiraKey: 'DIG', jiraBoardId: 8, plannerDir: '/tmp/dig' };
const loaded = (projects: ProjectConfig[], notifications = true): Fetched<MapleConfig> => ({
  data: { worktreesDir: '/tmp/wts', notifications, projects, actions: [] },
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
    status: {} as StatusEngine,
    setActiveTab: vi.fn(),
    setNotifications: vi.fn(() => Promise.resolve()),
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

describe('projectByKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { name: 'a known key', loads: [loaded([halo])], reload: false, key: 'HALO', want: halo },
    { name: 'an unknown key', loads: [loaded([halo])], reload: false, key: 'NOPE', want: null },
    { name: 'a failed load', loads: [first], reload: false, key: 'HALO', want: null },
    { name: 'a reloaded config', loads: [loaded([halo]), loaded([dig])], reload: true, key: 'DIG', want: dig },
  ])('returns the project for $name', async ({ loads, reload, key, want }) => {
    // given
    loadConfig.mockReset();
    loads.forEach((result) => loadConfig.mockResolvedValueOnce(result));
    registerConfig(deps());
    if (reload) {
      await handler('config:reload')(event);
    }
    // when
    const got = await projectByKey(key);
    // then
    expect(got).toEqual(want);
  });

  test('returns null before the config is registered', async () => {
    // given
    vi.resetModules();
    const fresh = await import('./config');
    // when
    const got = await fresh.projectByKey('HALO');
    // then
    expect(got).toBeNull();
    expect(loadConfig).not.toHaveBeenCalled();
  });
});

describe('notificationsDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { name: 'a config with notifications on', loads: [loaded([halo], true)], reload: false, want: true },
    { name: 'a config with notifications off', loads: [loaded([halo], false)], reload: false, want: false },
    { name: 'a failed load', loads: [first], reload: false, want: true },
    {
      name: 'a reload that turns them off',
      loads: [loaded([halo], true), loaded([halo], false)],
      reload: true,
      want: false,
    },
  ])('follows $name', async ({ loads, reload, want }) => {
    // given
    loadConfig.mockReset();
    loads.forEach((result) => loadConfig.mockResolvedValueOnce(result));
    registerConfig(deps());
    if (reload) {
      await handler('config:reload')(event);
    }
    // when
    const got = await notificationsDefault();
    // then
    expect(got).toBe(want);
  });

  test('defaults to on before the config is registered', async () => {
    // given
    vi.resetModules();
    const fresh = await import('./config');
    // when
    const got = await fresh.notificationsDefault();
    // then
    expect(got).toBe(true);
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
});
