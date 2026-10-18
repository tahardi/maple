import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { TabState } from '@shared/types';
import type { SessionManager } from '../sessions';
import { registerTabs } from './tabs';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, on } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: () => void) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: { handle, on } }));

const tab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-44',
  sessionId: 's1',
  worktreePath: null,
};

function fakeSessions() {
  return Object.assign(new EventEmitter(), {
    list: vi.fn(() => [tab]),
    startCard: vi.fn(() => tab),
    openCard: vi.fn(() => tab),
    openPlanner: vi.fn(() => tab),
    close: vi.fn(),
    resume: vi.fn(),
    startFresh: vi.fn(),
  });
}

function setup() {
  const sessions = fakeSessions();
  const sendToWindow = vi.fn();
  const win = { isDestroyed: () => false, webContents: { send: sendToWindow } } as unknown as BrowserWindow;
  registerTabs({
    window: () => win,
    worktreeFor: () => null,
    project: () => null,
    sessions: sessions as unknown as SessionManager,
  });
  return { sessions, sendToWindow };
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler: ${channel} is not registered`);
  }
  return call[1]({} as IpcMainInvokeEvent, ...args);
}

describe('registerTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { channel: 'tabs:list', args: [], method: 'list', want: [], result: [tab] },
    { channel: 'tabs:startCard', args: ['DIG', 'DIG-44'], method: 'startCard', want: ['DIG', 'DIG-44'], result: tab },
    {
      channel: 'tabs:openCard',
      args: ['DIG', 'DIG-44'],
      method: 'openCard',
      want: ['DIG', 'DIG-44', null],
      result: tab,
    },
    { channel: 'tabs:openPlanner', args: ['DIG'], method: 'openPlanner', want: ['DIG', null], result: tab },
    { channel: 'tabs:resume', args: ['t1'], method: 'resume', want: ['t1'], result: undefined },
    { channel: 'tabs:startFresh', args: ['t1'], method: 'startFresh', want: ['t1'], result: undefined },
  ] as const)('$channel calls $method', ({ channel, args, method, want, result }) => {
    // given
    const { sessions } = setup();
    // when
    const got = invoke(channel, ...args);
    // then
    expect(sessions[method]).toHaveBeenCalledWith(...want);
    expect(got).toEqual(result);
  });

  test('tabs:close closes the tab without asking to confirm', () => {
    // given
    const { sessions } = setup();
    // when
    const got = invoke('tabs:close', 't1', false);
    // then
    expect(sessions.close).toHaveBeenCalledWith('t1');
    expect(got).toEqual({ closed: true, needsConfirm: false });
  });

  test('a changed tab list is sent to the window', () => {
    // given
    const { sessions, sendToWindow } = setup();
    // when
    sessions.emit('changed', [tab]);
    // then
    expect(sendToWindow).toHaveBeenCalledWith('tabs:changed', [tab]);
  });
});
