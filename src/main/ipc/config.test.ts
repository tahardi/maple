import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { registerConfig } from './config';

type Handler = (event: IpcMainInvokeEvent) => Promise<unknown>;

const { handle, loadConfig, setAppMenu } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  loadConfig: vi.fn(),
  setAppMenu: vi.fn<(reload: () => Promise<unknown>) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../config', () => ({ loadConfig }));
vi.mock('../menu', () => ({ setAppMenu }));

const event = {} as IpcMainInvokeEvent;
const first = { data: null, error: 'reading config: missing', fetchedAt: null };
const second = { data: null, error: null, fetchedAt: '2026-10-17T00:00:00.000Z' };

function handler(channel: string): Handler {
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler for ${channel}`);
  }
  return call[1];
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
    registerConfig({ window: () => null, worktreeFor: () => null, project: () => null });
    // when
    const results = [await handler('config:get')(event), await handler('config:get')(event)];
    // then
    expect(results).toEqual([first, first]);
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  test('reload refreshes the cached config and notifies the window', async () => {
    // given
    const { win, sendToWindow } = fakeWindow(false);
    registerConfig({ window: () => win, worktreeFor: () => null, project: () => null });
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
    registerConfig({ window: () => (destroyed === null ? null : win), worktreeFor: () => null, project: () => null });
    // when
    const reloaded = await handler('config:reload')(event);
    // then
    expect(reloaded).toEqual(second);
    expect(sendToWindow).not.toHaveBeenCalled();
  });

  test('menu reload refreshes the cache and notifies the window', async () => {
    // given
    const { win, sendToWindow } = fakeWindow(false);
    registerConfig({ window: () => win, worktreeFor: () => null, project: () => null });
    const [[menuReload]] = setAppMenu.mock.calls;
    // when
    await menuReload();
    // then
    expect(await handler('config:get')(event)).toEqual(second);
    expect(sendToWindow).toHaveBeenCalledWith('config:changed', second);
  });
});
