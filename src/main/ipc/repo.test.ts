import { EventEmitter } from 'node:events';
import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { TabState } from '@shared/types/tabs/tabState';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import { registerRepo } from './repo';
import type { StartQueue } from '@main/sessions/StartQueue';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const {
  handle,
  stop,
  watchWorktree,
  changes,
  currentBranch,
  hasTryTarget,
  listFiles,
  mergeBase,
  readFilePair,
  repoName,
  searchFiles,
  writeWorktreeFile,
} = vi.hoisted(() => {
  const stop = vi.fn();
  return {
    handle: vi.fn<(channel: string, handler: Handler) => void>(),
    stop,
    watchWorktree: vi.fn(() => stop),
    changes: vi.fn(),
    currentBranch: vi.fn(),
    hasTryTarget: vi.fn(),
    listFiles: vi.fn(),
    mergeBase: vi.fn(),
    readFilePair: vi.fn(),
    repoName: vi.fn(),
    searchFiles: vi.fn(),
    writeWorktreeFile: vi.fn(),
  };
});

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/git/makeTarget', () => ({ hasTryTarget }));
vi.mock('@main/git/changes', () => ({ changes, mergeBase }));
vi.mock('@main/git/repoIdentity', () => ({ currentBranch, repoName }));
vi.mock('@main/git/worktreeFiles', () => ({ listFiles, readFilePair, searchFiles, writeWorktreeFile }));
vi.mock('@main/git/worktreeWatcher', () => ({ watchWorktree }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let worktree: string | null = '/wt';
let sessions = new EventEmitter() as SessionManager;

function invoke(channel: string, ...args: unknown[]): unknown {
  registerRepo(
    {
      window: () => null,
      worktreeFor: () => worktree,
      project: () => Promise.resolve(null),
      sessions,
      terminals: {} as Terminals,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      configLoaded: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
      setSeen: () => Promise.resolve(),
      seen: () => Promise.resolve({}),
      startQueue: new EventEmitter() as StartQueue,
      prs: { latest: () => Promise.resolve({ data: null, error: null, fetchedAt: null }), refresh: () => undefined },
      jira: new Promise<never>(() => undefined),
      jiraCreds: new Promise<never>(() => undefined),
      findingsDir: '/tmp/maple/findings',
    },
    logger,
  );
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler: ${channel} is not registered`);
  }
  return call[1]({} as IpcMainInvokeEvent, ...args);
}

describe('registerRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    worktree = '/wt';
    sessions = new EventEmitter() as SessionManager;
    mergeBase.mockResolvedValue('base');
    repoName.mockResolvedValue('maple');
    currentBranch.mockResolvedValue('mpl-155-repo-name');
    hasTryTarget.mockResolvedValue(true);
  });

  test.each([
    { name: 'stops the watcher of a tab that closed', tabs: [], stops: 1 },
    { name: 'keeps the watcher of a tab that is still open', tabs: [{ id: 't1' }], stops: 0 },
    { name: 'stops the watcher of a closed tab only once', tabs: [], stops: 1, emits: 2 },
  ])('$name', async ({ tabs, stops, emits = 1 }) => {
    // given
    changes.mockResolvedValue(null);
    await invoke('repo:changes', 't1');
    // when
    for (let i = 0; i < emits; i++) {
      sessions.emit('changed', tabs as TabState[]);
    }
    // then
    expect(stop).toHaveBeenCalledTimes(stops);
  });

  test.each([
    { channel: 'repo:changes', args: ['t1'], fail: changes },
    { channel: 'repo:info', args: ['t1'], fail: repoName },
    { channel: 'repo:info', args: ['t1'], fail: currentBranch },
    { channel: 'repo:info', args: ['t1'], fail: hasTryTarget },
    { channel: 'repo:listFiles', args: ['t1'], fail: listFiles },
    { channel: 'repo:readFile', args: ['t1', 'a.ts'], fail: readFilePair },
    { channel: 'repo:search', args: ['t1', 'needle'], fail: searchFiles },
    { channel: 'repo:writeFile', args: ['t1', 'a.ts', 'x'], logged: ['t1', 'a.ts'], fail: writeWorktreeFile },
  ])('$channel logs a failure at warn and rethrows', async ({ channel, args, logged, fail }) => {
    // given
    fail.mockRejectedValue(new Error('running git: not a repo'));
    // when
    const got = invoke(channel, ...args);
    // then
    await expect(got).rejects.toThrow('running git: not a repo');
    expect(logger.warn).toHaveBeenCalledWith('repo', 'failed', {
      operation: channel,
      args: logged ?? args,
      error: 'running git: not a repo',
    });
  });

  test('repo:changes returns the change set without logging', async () => {
    // given
    changes.mockResolvedValue({ files: [] });
    // when
    const got = await invoke('repo:changes', 't1');
    // then
    expect(got).toEqual({ files: [] });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('repo:info returns the repo name and branch of the tab worktree', async () => {
    // given
    repoName.mockResolvedValue('maple');
    currentBranch.mockResolvedValue('mpl-155-repo-name');
    // when
    const got = await invoke('repo:info', 't1');
    // then
    expect(got).toEqual({ name: 'maple', branch: 'mpl-155-repo-name', hasTry: true });
    expect(repoName).toHaveBeenCalledWith('/wt');
    expect(currentBranch).toHaveBeenCalledWith('/wt');
    expect(hasTryTarget).toHaveBeenCalledWith('/wt');
  });

  test('repo:info returns null for a tab without a worktree', async () => {
    // given
    worktree = null;
    // when
    const got = await invoke('repo:info', 't1');
    // then
    expect(got).toBeNull();
    expect(repoName).not.toHaveBeenCalled();
    expect(hasTryTarget).not.toHaveBeenCalled();
  });

  test('repo:writeFile writes the file in the tab worktree', async () => {
    // given
    writeWorktreeFile.mockResolvedValue(undefined);
    // when
    await invoke('repo:writeFile', 't1', 'a.ts', 'x');
    // then
    expect(writeWorktreeFile).toHaveBeenCalledWith('/wt', 'a.ts', 'x');
  });

  test('repo:readFile compares against HEAD when the repo has no default branch', async () => {
    // given
    mergeBase.mockResolvedValue(null);
    readFilePair.mockResolvedValue({ kind: 'binary', path: 'a.ts' });
    // when
    await invoke('repo:readFile', 't1', 'a.ts');
    // then
    expect(readFilePair).toHaveBeenCalledWith('/wt', 'HEAD', 'a.ts');
  });

  test('repo:search searches the tab worktree', async () => {
    // given
    searchFiles.mockResolvedValue([{ path: 'a.ts', line: 3, text: 'needle' }]);
    // when
    const got = await invoke('repo:search', 't1', 'needle');
    // then
    expect(searchFiles).toHaveBeenCalledWith('/wt', 'needle');
    expect(got).toEqual([{ path: 'a.ts', line: 3, text: 'needle' }]);
  });
});
