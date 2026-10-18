import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, test, vi } from 'vitest';
import { registerConfig } from './config';

type Handler = (event: IpcMainInvokeEvent) => Promise<unknown>;

const { handle, loadConfig } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  loadConfig: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle }, Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() } }));
vi.mock('../config', () => ({ loadConfig }));

function handler(channel: string): Handler {
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler for ${channel}`);
  }
  return call[1];
}

describe('registerConfig', () => {
  test('reload refreshes the cached config and notifies the window', async () => {
    // given
    const first = { data: null, error: 'reading config: missing', fetchedAt: null };
    const second = { data: null, error: null, fetchedAt: '2026-10-17T00:00:00.000Z' };
    loadConfig.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const sendToWindow = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send: sendToWindow } };
    registerConfig({ window: () => win as never, worktreeFor: () => null });
    const event = {} as IpcMainInvokeEvent;
    // when
    const before = await handler('config:get')(event);
    await handler('config:reload')(event);
    const after = await handler('config:get')(event);
    // then
    expect(before).toEqual(first);
    expect(after).toEqual(second);
    expect(sendToWindow).toHaveBeenCalledWith('config:changed', second);
  });
});
