import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import { registerApp } from './app';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle, on: vi.fn() } }));

describe('registerApp', () => {
  test.each([true, false])('app:setNotifications passes %s to the setter', async (on) => {
    // given
    handle.mockClear();
    const setNotifications = vi.fn(() => Promise.resolve());
    registerApp({
      window: () => null,
      worktreeFor: () => null,
      project: () => Promise.resolve(null),
      sessions: {} as SessionManager,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      setNotifications,
    });
    const call = handle.mock.calls.find(([channel]) => channel === 'app:setNotifications');
    // when
    await call?.[1]({} as IpcMainInvokeEvent, on);
    // then
    expect(setNotifications).toHaveBeenCalledWith(on);
  });
});
