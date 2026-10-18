import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IPC_CHANNELS, type ChannelKind } from '@shared/ipc';
import { registerIpc } from './index';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const { handle, on } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: () => void) => void>(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle, on },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
}));
vi.mock('../config', () => ({ loadConfig: () => Promise.resolve({ data: null, error: null, fetchedAt: null }) }));

function channelsOf(kind: ChannelKind): string[] {
  return Object.entries(IPC_CHANNELS).flatMap(([area, methods]) =>
    Object.entries(methods)
      .filter(([, methodKind]) => methodKind === kind)
      .map(([method]) => `${area}:${method}`),
  );
}

describe('registerIpc', () => {
  const deps = { window: () => null, worktreeFor: () => null };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('registers exactly one handler per request channel', () => {
    // given
    const expected = channelsOf('invoke').sort();
    // when
    registerIpc(deps);
    // then
    const registered = handle.mock.calls.map(([channel]) => channel);
    expect(registered.sort()).toEqual(expected);
  });

  test('registers exactly one listener per send channel', () => {
    // given
    const expected = channelsOf('send').sort();
    // when
    registerIpc(deps);
    // then
    const registered = on.mock.calls.map(([channel]) => channel);
    expect(registered.sort()).toEqual(expected);
  });

  test('rejects stub requests as not implemented', async () => {
    // given
    registerIpc(deps);
    const call = handle.mock.calls.find(([channel]) => channel === 'jira:sprint');
    // when
    const result = call?.[1]({} as IpcMainInvokeEvent, 'DIG');
    // then
    await expect(result).rejects.toThrow('jira:sprint is not implemented');
  });
});
