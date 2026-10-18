import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { TabState, TabStatus } from '@shared/types';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import { registerApp } from './app';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
type QuitEvent = { preventDefault: () => void };

const { handle, on, appOn, quit } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: () => void) => void>(),
  appOn: vi.fn<(event: string, listener: (e: QuitEvent) => void) => void>(),
  quit: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle, on }, app: { on: appOn, quit } }));

const tabs: Record<string, TabState> = {
  t1: { id: 't1', projectKey: 'DIG', kind: 'card', cardKey: 'DIG-44', sessionId: 's1', worktreePath: null },
  t2: { id: 't2', projectKey: 'BEAR', kind: 'card', cardKey: 'BEAR-12', sessionId: 's2', worktreePath: null },
  t3: { id: 't3', projectKey: 'DIG', kind: 'card', cardKey: 'DIG-45', sessionId: 's3', worktreePath: null },
};

function setup(dots: Record<string, TabStatus['dot']> = {}) {
  const sendToWindow = vi.fn();
  const setNotifications = vi.fn(() => Promise.resolve());
  const statuses = Object.entries(dots).map(([tabId, dot]) => ({ tabId, dot, sessionAlive: true, exitCode: null }));
  registerApp({
    window: () => ({ isDestroyed: () => false, webContents: { send: sendToWindow } }) as unknown as BrowserWindow,
    worktreeFor: () => null,
    project: () => Promise.resolve(null),
    sessions: { get: (id: string) => tabs[id] ?? null } as unknown as SessionManager,
    status: { statuses: () => statuses } as unknown as StatusEngine,
    setActiveTab: () => undefined,
    setNotifications,
  });
  const beforeQuit = appOn.mock.calls.find(([name]) => name === 'before-quit')?.[1];
  const confirmQuit = on.mock.calls.find(([name]) => name === 'app:confirmQuit')?.[1];
  if (!beforeQuit || !confirmQuit) {
    throw new Error('finding quit listeners');
  }
  const requestQuit = () => {
    const event = { preventDefault: vi.fn() };
    beforeQuit(event);
    return event;
  };
  return { sendToWindow, setNotifications, requestQuit, confirmQuit };
}

describe('registerApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([true, false])('app:setNotifications passes %s to the setter', async (on) => {
    // given
    const { setNotifications } = setup();
    const call = handle.mock.calls.find(([channel]) => channel === 'app:setNotifications');
    // when
    await call?.[1]({} as IpcMainInvokeEvent, on);
    // then
    expect(setNotifications).toHaveBeenCalledWith(on);
  });

  test('quitting while cards work is prevented and asks the window with their keys', () => {
    // given
    const { sendToWindow, requestQuit } = setup({ t1: 'working', t2: 'working', t3: 'idle' });
    // when
    const event = requestQuit();
    // then
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sendToWindow).toHaveBeenCalledWith('app:quitRequested', ['DIG-44', 'BEAR-12']);
  });

  test('quitting with no working cards goes ahead', () => {
    // given
    const { sendToWindow, requestQuit } = setup({ t1: 'ready' });
    // when
    const event = requestQuit();
    // then
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sendToWindow).not.toHaveBeenCalled();
  });

  test('confirming quits without asking again', () => {
    // given
    const { sendToWindow, requestQuit, confirmQuit } = setup({ t1: 'working' });
    // when
    confirmQuit();
    const event = requestQuit();
    // then
    expect(quit).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sendToWindow).not.toHaveBeenCalled();
  });
});
