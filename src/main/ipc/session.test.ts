import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import type { Terminals } from '../terminals';
import { registerSession } from './session';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Listener = (event: IpcMainEvent, ...args: unknown[]) => void;

const { handle, on } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: Listener) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: { handle, on } }));

function setup() {
  const sessions = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    resize: vi.fn(),
    sendPrompt: vi.fn(),
    backlog: vi.fn(() => 'old output'),
  });
  const sendToWindow = vi.fn();
  const win = { isDestroyed: () => false, webContents: { send: sendToWindow } } as unknown as BrowserWindow;
  registerSession({
    window: () => win,
    worktreeFor: () => null,
    project: () => Promise.resolve(null),
    sessions: sessions as unknown as SessionManager,
    terminals: {} as Terminals,
    status: {} as StatusEngine,
    setActiveTab: () => undefined,
    warnings: () => [],
    hooksFile: '/cfg/hooksFile.json',
    setNotifications: () => Promise.resolve(),
    setZoom: () => Promise.resolve(),
  });
  return { sessions, sendToWindow };
}

function listener(channel: string): Listener {
  const call = on.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding listener: ${channel} is not registered`);
  }
  return call[1];
}

describe('registerSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { channel: 'session:write', args: ['t1', 'x'], method: 'write' },
    { channel: 'session:resize', args: ['t1', 80, 24], method: 'resize' },
    { channel: 'session:sendPrompt', args: ['t1', 'hi'], method: 'sendPrompt' },
  ] as const)('$channel calls $method', ({ channel, args, method }) => {
    // given
    const { sessions } = setup();
    // when
    listener(channel)({} as IpcMainEvent, ...args);
    // then
    expect(sessions[method]).toHaveBeenCalledWith(...args);
  });

  test('session:backlog returns the tab backlog', () => {
    // given
    const { sessions } = setup();
    const call = handle.mock.calls.find(([name]) => name === 'session:backlog');
    // when
    const got = call?.[1]({} as IpcMainInvokeEvent, 't1');
    // then
    expect(sessions.backlog).toHaveBeenCalledWith('t1');
    expect(got).toBe('old output');
  });

  test.each([
    { event: 'data', args: ['t1', 'out'], channel: 'session:data:t1', payload: 'out' },
    { event: 'batch', args: ['DIG', ['DIG-1']], channel: 'session:batch:DIG', payload: ['DIG-1'] },
  ])('a $event event is sent on $channel', ({ event, args, channel, payload }) => {
    // given
    const { sessions, sendToWindow } = setup();
    // when
    sessions.emit(event, ...args);
    // then
    expect(sendToWindow).toHaveBeenCalledWith(channel, payload);
  });
});
