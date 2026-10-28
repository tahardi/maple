import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config';
import type { TabState } from '@shared/types/tabs';
import type { SessionManager } from '@main/sessions/sessions';
import type { StatusEngine } from '@main/sessions/status';
import type { Terminals } from '@main/sessions/terminals';
import { registerTerminal } from './terminal';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Listener = (event: IpcMainEvent, ...args: unknown[]) => void;

const { handle, on } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: Listener) => void>(),
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

const project: ProjectConfig = {
  name: 'Dig Days',
  jiraKey: 'DIG',
  jiraBoardId: 1,
  plannerDir: '/tmp/dig',
  repo: 'tahardi/dig-days',
};

function setup(tabs: TabState[] = [tab]) {
  const sessions = { get: vi.fn((tabId: string) => tabs.find((t) => t.id === tabId) ?? null) };
  const terminals = Object.assign(new EventEmitter(), {
    open: vi.fn(),
    close: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    backlog: vi.fn(() => 'old output'),
  });
  const sendToWindow = vi.fn();
  const win = { isDestroyed: () => false, webContents: { send: sendToWindow } } as unknown as BrowserWindow;
  registerTerminal({
    window: () => win,
    worktreeFor: () => null,
    project: (key) => Promise.resolve(key === 'DIG' ? project : null),
    sessions: sessions as unknown as SessionManager,
    terminals: terminals as unknown as Terminals,
    status: {} as StatusEngine,
    setActiveTab: () => undefined,
    warnings: () => [],
    setNotifications: () => Promise.resolve(),
    setZoom: () => Promise.resolve(),
    setLastProject: () => Promise.resolve(),
    lastProject: () => Promise.resolve(null),
  });
  return { terminals, sendToWindow };
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler: ${channel} is not registered`);
  }
  return call[1]({} as IpcMainInvokeEvent, ...args);
}

function listener(channel: string): Listener {
  const call = on.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding listener: ${channel} is not registered`);
  }
  return call[1];
}

describe('registerTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { name: "the tab's worktree", worktreePath: '/tmp/wts/dig-44', cwd: '/tmp/wts/dig-44' },
    { name: "the project's plannerDir without a worktree", worktreePath: null, cwd: '/tmp/dig' },
  ])('terminal:open opens a shell in $name', async ({ worktreePath, cwd }) => {
    // given
    const { terminals } = setup([{ ...tab, worktreePath }]);
    // when
    await invoke('terminal:open', 't1', 't1');
    // then
    expect(terminals.open).toHaveBeenCalledWith('t1', cwd);
  });

  test('terminal:open opens the terminal id in the tab cwd', async () => {
    // given
    const { terminals } = setup();
    // when
    await invoke('terminal:open', 't1', 't1:2');
    // then
    expect(terminals.open).toHaveBeenCalledWith('t1:2', '/tmp/dig');
  });

  test.each(['t2', 't2:1', 't10', 't1x'])('terminal:open rejects %s for tab t1', async (terminalId) => {
    // given
    const { terminals } = setup([tab, { ...tab, id: 't2' }, { ...tab, id: 't10' }]);
    // when
    const got = invoke('terminal:open', 't1', terminalId);
    // then
    await expect(got).rejects.toThrow(`opening terminal: ${terminalId} is not a terminal of t1`);
    expect(terminals.open).not.toHaveBeenCalled();
  });

  test('terminal:close closes one terminal', async () => {
    // given
    const { terminals } = setup();
    // when
    await invoke('terminal:close', 't1:2');
    // then
    expect(terminals.close).toHaveBeenCalledWith('t1:2');
  });

  test('terminal:close rejects an empty terminal id', () => {
    // given
    const { terminals } = setup();
    // when
    const got = () => invoke('terminal:close', '');
    // then
    expect(got).toThrow('handling terminal:close: arguments are invalid');
    expect(terminals.close).not.toHaveBeenCalled();
  });

  test('terminal:open rejects an unknown tab', async () => {
    // given
    const { terminals } = setup([]);
    // when
    const got = invoke('terminal:open', 't9', 't9');
    // then
    await expect(got).rejects.toThrow('opening terminal: unknown tab t9');
    expect(terminals.open).not.toHaveBeenCalled();
  });

  test.each([
    { channel: 'terminal:write', args: ['t1:2', 'x'], method: 'write' },
    { channel: 'terminal:resize', args: ['t1:2', 80, 24], method: 'resize' },
  ] as const)('$channel calls $method', ({ channel, args, method }) => {
    // given
    const { terminals } = setup();
    // when
    listener(channel)({} as IpcMainEvent, ...args);
    // then
    expect(terminals[method]).toHaveBeenCalledWith(...args);
  });

  test('terminal:open rejects a tab whose project is not configured', async () => {
    // given
    const { terminals } = setup([{ ...tab, projectKey: 'HALO' }]);
    // when
    const got = invoke('terminal:open', 't1', 't1');
    // then
    await expect(got).rejects.toThrow('opening terminal: unknown project HALO');
    expect(terminals.open).not.toHaveBeenCalled();
  });

  test.each([
    { channel: 'terminal:write', args: ['', 'x'], method: 'write' },
    { channel: 'terminal:write', args: ['t1', 42], method: 'write' },
    { channel: 'terminal:resize', args: ['t1', 0, 24], method: 'resize' },
    { channel: 'terminal:resize', args: ['t1', 80, 1.5], method: 'resize' },
  ] as const)('$channel drops invalid args $args', ({ channel, args, method }) => {
    // given
    const { terminals } = setup();
    // when
    listener(channel)({} as IpcMainEvent, ...args);
    // then
    expect(terminals[method]).not.toHaveBeenCalled();
  });

  test('terminal:backlog returns the terminal backlog', () => {
    // given
    const { terminals } = setup();
    // when
    const got = invoke('terminal:backlog', 't1:2');
    // then
    expect(terminals.backlog).toHaveBeenCalledWith('t1:2');
    expect(got).toBe('old output');
  });

  test.each([
    { event: 'data', args: ['t1:2', 'out'], channel: 'terminal:data:t1:2', payload: 'out' },
    { event: 'exit', args: ['t1:2', 1], channel: 'terminal:exit:t1:2', payload: 1 },
  ])('a $event event is sent on $channel', ({ event, args, channel, payload }) => {
    // given
    const { terminals, sendToWindow } = setup();
    // when
    terminals.emit(event, ...args);
    // then
    expect(sendToWindow).toHaveBeenCalledWith(channel, payload);
  });
});
