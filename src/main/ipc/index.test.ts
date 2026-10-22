import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IPC_CHANNELS, type ChannelKind } from '@shared/ipc';
import { SessionManager } from '@main/sessions/sessions';
import { StatusEngine } from '@main/sessions/status';
import { Terminals } from '@main/sessions/terminals';
import { registerIpc } from './index';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, on } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  on: vi.fn<(channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void>(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle, on },
  app: { on: vi.fn(), quit: vi.fn() },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
}));
vi.mock('@main/app/config', () => ({
  loadConfig: () => Promise.resolve({ data: null, error: null, fetchedAt: null }),
}));

function channelsOf(kind: ChannelKind): string[] {
  return Object.entries(IPC_CHANNELS).flatMap(([area, methods]) =>
    Object.entries(methods)
      .filter(([, methodKind]) => methodKind === kind)
      .map(([method]) => `${area}:${method}`),
  );
}

describe('registerIpc', () => {
  const sessions = new SessionManager({
    spawn: vi.fn(),
    config: vi.fn(),
    hooksFile: '',
    socketPath: '',
    save: vi.fn(),
    closedSessions: {},
    uuid: vi.fn(),
    hasTranscript: vi.fn(),
    tmuxConf: '',
    endTmux: vi.fn(),
    sessionEnv: {},
  });
  const status = new StatusEngine({
    sessions,
    getCard: vi.fn(),
    prFor: vi.fn(),
  });
  const deps = {
    window: () => null,
    worktreeFor: () => null,
    project: () => Promise.resolve(null),
    sessions,
    terminals: new Terminals({ spawn: vi.fn() }),
    status,
    setActiveTab: vi.fn(),
    warnings: () => [],
    setNotifications: vi.fn(),
    setZoom: vi.fn(),
    setLastProject: vi.fn(() => Promise.resolve()),
    lastProject: () => Promise.resolve(null),
  };

  sessions.setMaxListeners(0);
  status.setMaxListeners(0);

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

  test.each([
    { channel: 'jira:sprint', args: [7] },
    { channel: 'tabs:startCard', args: ['MPL', '../../myself?'] },
    { channel: 'tabs:startCard', args: ['mpl', 'MPL-1'] },
    { channel: 'tabs:openCard', args: ['MPL', '--help'] },
    { channel: 'tabs:openPlanner', args: [{}] },
    { channel: 'tabs:close', args: ['t1', 'yes'] },
    { channel: 'tabs:resume', args: [null] },
    { channel: 'tabs:startFresh', args: [1] },
    { channel: 'session:backlog', args: [1] },
    { channel: 'repo:changes', args: [['t1']] },
    { channel: 'repo:listFiles', args: [''] },
    { channel: 'repo:readFile', args: ['t1', 5] },
    { channel: 'pr:get', args: [1] },
    { channel: 'pr:approve', args: ['t1', 'extra'] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', null, 0, 'x'] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', null, 1.5, 'x'] },
    { channel: 'pr:comment', args: ['t1', '', null, 1, 'x'] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', null, 1, ''] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', 0, 3, 'x'] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', 1.5, 3, 'x'] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', 3, 3, 'x'] },
    { channel: 'pr:comment', args: ['t1', 'a.ts', 4, 3, 'x'] },
    { channel: 'pr:reply', args: ['t1', 0, 'x'] },
    { channel: 'pr:reply', args: ['t1', 1.5, 'x'] },
    { channel: 'pr:reply', args: ['t1', 1, ''] },
    { channel: 'pr:reply', args: ['t1', 1, 'x'.repeat(65_537)] },
    { channel: 'pr:resolve', args: ['t1', '', true] },
    { channel: 'pr:resolve', args: ['t1', 5, true] },
    { channel: 'pr:resolve', args: ['t1', 'PRRT_1'] },
    { channel: 'pr:resolve', args: ['t1', 'PRRT_1', 'yes'] },
    { channel: 'pr:comments', args: [1] },
    { channel: 'pr:diffLines', args: [1] },
    { channel: 'app:setNotifications', args: ['yes'] },
  ])('$channel rejects invalid arguments $args', async ({ channel, args }) => {
    // given
    registerIpc(deps);
    const handler = handle.mock.calls.find(([name]) => name === channel)?.[1];
    // when
    const got = Promise.resolve().then(() => handler?.({} as IpcMainInvokeEvent, ...args));
    // then
    await expect(got).rejects.toThrow(`handling ${channel}: arguments are invalid`);
  });

  test.each([
    { channel: 'tabs:setActive', args: [5], spy: () => deps.setActiveTab },
    { channel: 'session:write', args: ['t1', 5], spy: () => vi.spyOn(sessions, 'write') },
    { channel: 'session:resize', args: ['t1', 80, 1e9], spy: () => vi.spyOn(sessions, 'resize') },
    { channel: 'session:sendPrompt', args: ['t1', {}], spy: () => vi.spyOn(sessions, 'sendPrompt') },
  ])('$channel drops invalid arguments $args', ({ channel, args, spy }) => {
    // given
    const target = spy();
    registerIpc(deps);
    const listener = on.mock.calls.find(([name]) => name === channel)?.[1];
    // when
    listener?.({}, ...args);
    // then
    expect(listener).toBeDefined();
    expect(target).not.toHaveBeenCalled();
  });
});
