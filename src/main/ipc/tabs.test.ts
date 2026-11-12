import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import type { QueueState } from '@shared/types/queue/queueState';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StartQueue } from '@main/sessions/StartQueue';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import { registerTabs } from './tabs';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, on } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: { handle, on } }));

const tab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-44',
  sessionId: 's1',
  worktreePath: null,
  worktreePaths: [],
};

function fakeSessions() {
  return Object.assign(new EventEmitter(), {
    list: vi.fn(() => [tab]),
    startCard: vi.fn(() => tab),
    openCard: vi.fn(() => tab),
    openPlanner: vi.fn(() => tab),
    openVault: vi.fn(() => tab),
    openLearning: vi.fn(() => tab),
    close: vi.fn(),
    resume: vi.fn(),
    startFresh: vi.fn(),
    selectWorktree: vi.fn(),
    get: vi.fn((tabId: string) => (tabId === 't1' ? tab : null)),
  });
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const cost: SessionCost = {
  inputTokens: 1,
  outputTokens: 2,
  cacheWriteTokens: 3,
  cacheReadTokens: 4,
  dollars: 0.5,
};
const sessionCost = vi.fn<(sessionId: string) => Promise<SessionCost | null>>(() => Promise.resolve(cost));

const status: TabStatus = {
  tabId: 't1',
  dot: 'waiting',
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
  sync: null,
};

const queueState: QueueState = {
  cards: [{ projectKey: 'DIG', cardKey: 'DIG-45' }],
  working: 4,
  limit: 4,
  waitingFor: 'room',
  gapSeconds: 90,
  failure: null,
};

function fakeQueue() {
  return Object.assign(new EventEmitter(), {
    add: vi.fn((): TabState | null => tab),
    remove: vi.fn(),
    move: vi.fn(),
    state: vi.fn(() => queueState),
  });
}

function setup() {
  const sessions = fakeSessions();
  const startQueue = fakeQueue();
  const engine = Object.assign(new EventEmitter(), { statuses: vi.fn(() => [status]) });
  const terminals = { closeTab: vi.fn() };
  const setActiveTab = vi.fn();
  const sendToWindow = vi.fn();
  const win = { isDestroyed: () => false, webContents: { send: sendToWindow } } as unknown as BrowserWindow;
  registerTabs(
    {
      window: () => win,
      worktreeFor: () => null,
      project: () => Promise.resolve(null),
      sessions: sessions as unknown as SessionManager,
      terminals: terminals as unknown as Terminals,
      status: engine as unknown as StatusEngine,
      setActiveTab,
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      configLoaded: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
      setSeen: () => Promise.resolve(),
      seen: () => Promise.resolve({}),
      startQueue: startQueue as unknown as StartQueue,
      prs: { latest: () => Promise.resolve({ data: null, error: null, fetchedAt: null }), refresh: () => undefined },
      jira: new Promise<never>(() => undefined),
      jiraCreds: new Promise<never>(() => undefined),
      watchVault: () => undefined,
      warnings: () => [],
    },
    logger,
    sessionCost,
  );
  return { sessions, terminals, engine, setActiveTab, sendToWindow, startQueue };
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
    {
      channel: 'tabs:openCard',
      args: ['DIG', 'DIG-44'],
      method: 'openCard',
      want: ['DIG', 'DIG-44', null],
      result: tab,
    },
    { channel: 'tabs:openPlanner', args: ['DIG'], method: 'openPlanner', want: ['DIG', null], result: tab },
    { channel: 'tabs:openVault', args: ['DIG'], method: 'openVault', want: ['DIG', null], result: tab },
    { channel: 'tabs:openLearning', args: ['DIG'], method: 'openLearning', want: ['DIG', null], result: tab },
    { channel: 'tabs:resume', args: ['t1'], method: 'resume', want: ['t1'], result: undefined },
    { channel: 'tabs:startFresh', args: ['t1'], method: 'startFresh', want: ['t1'], result: undefined },
    {
      channel: 'tabs:selectWorktree',
      args: ['t1', '/wts/a'],
      method: 'selectWorktree',
      want: ['t1', '/wts/a'],
      result: undefined,
    },
  ] as const)('$channel calls $method', ({ channel, args, method, want, result }) => {
    // given
    const { sessions } = setup();
    // when
    const got = invoke(channel, ...args);
    // then
    expect(sessions[method]).toHaveBeenCalledWith(...want);
    expect(got).toEqual(result);
  });

  test.each([
    { name: 'a tab', result: tab },
    { name: 'null', result: null },
  ])('tabs:startCard adds the card to the start queue and returns its result: $name', ({ result }) => {
    // given
    const { sessions, startQueue } = setup();
    startQueue.add.mockReturnValue(result);
    // when
    const got = invoke('tabs:startCard', 'DIG', 'DIG-44');
    // then
    expect(startQueue.add).toHaveBeenCalledWith('DIG', 'DIG-44');
    expect(sessions.startCard).not.toHaveBeenCalled();
    expect(got).toEqual(result);
  });

  test('tabs:startCard logs a failed start at warn and rethrows', () => {
    // given
    const { startQueue } = setup();
    startQueue.add.mockImplementation(() => {
      throw new Error('finding project: NOPE');
    });
    // when
    const run = () => invoke('tabs:startCard', 'NOPE', 'NOPE-1');
    // then
    expect(run).toThrow('finding project: NOPE');
    expect(logger.warn).toHaveBeenCalledWith('session', 'failed', {
      operation: 'tabs:startCard',
      args: ['NOPE', 'NOPE-1'],
      error: 'finding project: NOPE',
    });
  });

  test('tabs:startQueue returns the queue state', () => {
    // given
    setup();
    // when
    const got = invoke('tabs:startQueue');
    // then
    expect(got).toEqual(queueState);
  });

  test('tabs:unqueue removes the card from the queue', () => {
    // given
    const { startQueue } = setup();
    // when
    invoke('tabs:unqueue', 'DIG-45');
    // then
    expect(startQueue.remove).toHaveBeenCalledWith('DIG-45');
  });

  test('tabs:moveQueued moves the card to the index', () => {
    // given
    const { startQueue } = setup();
    // when
    invoke('tabs:moveQueued', 'DIG-45', 2);
    // then
    expect(startQueue.move).toHaveBeenCalledWith('DIG-45', 2);
  });

  test.each([
    { name: 'a negative index', index: -1 },
    { name: 'a fraction', index: 1.5 },
  ])('tabs:moveQueued rejects $name', ({ index }) => {
    // given
    const { startQueue } = setup();
    // when
    const run = () => invoke('tabs:moveQueued', 'DIG-45', index);
    // then
    expect(run).toThrow('handling tabs:moveQueued: arguments are invalid');
    expect(startQueue.move).not.toHaveBeenCalled();
  });

  test('a queue change is sent to the window', () => {
    // given
    const { startQueue, sendToWindow } = setup();
    // when
    startQueue.emit('changed', queueState);
    // then
    expect(sendToWindow).toHaveBeenCalledWith('tabs:queue', queueState);
  });

  test('tabs:selectWorktree rejects an empty path', () => {
    // given
    const { sessions } = setup();
    // when
    const run = () => invoke('tabs:selectWorktree', 't1', '');
    // then
    expect(run).toThrow('handling tabs:selectWorktree: arguments are invalid');
    expect(sessions.selectWorktree).not.toHaveBeenCalled();
  });

  test('tabs:close asks to confirm when the tab is working and not forced', () => {
    // given
    const { sessions, engine } = setup();
    engine.statuses.mockReturnValue([{ ...status, dot: 'working' }]);
    // when
    const got = invoke('tabs:close', 't1', false);
    // then
    expect(sessions.close).not.toHaveBeenCalled();
    expect(got).toEqual({ closed: false, needsConfirm: true });
  });

  test.each([
    { name: 'a working tab when forced', dot: 'working', force: true },
    { name: 'an idle tab', dot: 'idle', force: false },
  ] as const)('tabs:close closes $name', ({ dot, force }) => {
    // given
    const { sessions, engine } = setup();
    engine.statuses.mockReturnValue([{ ...status, dot }]);
    // when
    const got = invoke('tabs:close', 't1', force);
    // then
    expect(sessions.close).toHaveBeenCalledWith('t1');
    expect(got).toEqual({ closed: true, needsConfirm: false });
  });

  test('tabs:close closes the tab shell', () => {
    // given
    const { terminals } = setup();
    // when
    invoke('tabs:close', 't1', false);
    // then
    expect(terminals.closeTab).toHaveBeenCalledWith('t1');
  });

  test('tabs:close keeps the shell when asking to confirm', () => {
    // given
    const { terminals, engine } = setup();
    engine.statuses.mockReturnValue([{ ...status, dot: 'working' }]);
    // when
    invoke('tabs:close', 't1', false);
    // then
    expect(terminals.closeTab).not.toHaveBeenCalled();
  });

  test('a changed tab list is sent to the window', () => {
    // given
    const { sessions, sendToWindow } = setup();
    // when
    sessions.emit('changed', [tab]);
    // then
    expect(sendToWindow).toHaveBeenCalledWith('tabs:changed', [tab]);
  });

  test('tabs:cost returns the cost of the tab session', async () => {
    // given
    setup();
    // when
    const result = await invoke('tabs:cost', 't1');
    // then
    expect(sessionCost).toHaveBeenCalledWith('s1');
    expect(result).toEqual(cost);
  });

  test('tabs:cost for an unknown tab returns null', async () => {
    // given
    setup();
    // when
    const result = await invoke('tabs:cost', 'nope');
    // then
    expect(sessionCost).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  test('tabs:cost logs a failure at warn and rethrows', async () => {
    // given
    setup();
    sessionCost.mockRejectedValueOnce(new Error('reading transcript: gone'));
    // when
    const result = invoke('tabs:cost', 't1');
    // then
    await expect(result).rejects.toThrow('reading transcript: gone');
    expect(logger.warn).toHaveBeenCalledWith('session', 'failed', {
      operation: 'tabs:cost',
      args: ['t1'],
      error: 'reading transcript: gone',
    });
  });

  test('tabs:statuses returns the engine statuses', () => {
    // given
    setup();
    // when
    const got = invoke('tabs:statuses');
    // then
    expect(got).toEqual([status]);
  });

  test('a status change is sent to the window', () => {
    // given
    const { engine, sendToWindow } = setup();
    // when
    engine.emit('status', status, 'working');
    // then
    expect(sendToWindow).toHaveBeenCalledWith('tabs:status', status);
  });

  test.each(['t1', null])('tabs:setActive records %s as the active tab', (tabId) => {
    // given
    const { setActiveTab } = setup();
    const listener = on.mock.calls.find(([name]) => name === 'tabs:setActive')?.[1];
    // when
    listener?.({}, tabId);
    // then
    expect(setActiveTab).toHaveBeenCalledWith(tabId);
  });

  test.each([
    { name: 'another tab is working', statuses: [{ ...status, tabId: 't2', dot: 'working' as const }] },
    { name: 'the tab has no status', statuses: [] },
  ])('tabs:close closes without asking when $name', ({ statuses }) => {
    // given
    const { sessions, engine } = setup();
    engine.statuses.mockReturnValue(statuses);
    // when
    const got = invoke('tabs:close', 't1', false);
    // then
    expect(sessions.close).toHaveBeenCalledWith('t1');
    expect(got).toEqual({ closed: true, needsConfirm: false });
  });

  test.each([
    { channel: 'tabs:openCard', args: ['NOPE', 'NOPE-1'], method: 'openCard' },
    { channel: 'tabs:openPlanner', args: ['NOPE'], method: 'openPlanner' },
    { channel: 'tabs:openVault', args: ['NOPE'], method: 'openVault' },
    { channel: 'tabs:openLearning', args: ['NOPE'], method: 'openLearning' },
    { channel: 'tabs:resume', args: ['gone'], method: 'resume' },
    { channel: 'tabs:startFresh', args: ['gone'], method: 'startFresh' },
  ] as const)('$channel logs a failure at warn and rethrows', ({ channel, args, method }) => {
    // given
    const { sessions } = setup();
    sessions[method].mockImplementation(() => {
      throw new Error('finding tab: gone');
    });
    // when
    const run = () => invoke(channel, ...args);
    // then
    expect(run).toThrow('finding tab: gone');
    expect(logger.warn).toHaveBeenCalledWith('session', 'failed', {
      operation: channel,
      args: [...args],
      error: 'finding tab: gone',
    });
  });
});
