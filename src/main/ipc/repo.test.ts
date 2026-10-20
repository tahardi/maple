import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import { registerRepo } from './repo';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, changes, listFiles, mergeBase, readFilePair, writeWorktreeFile } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  changes: vi.fn(),
  listFiles: vi.fn(),
  mergeBase: vi.fn(),
  readFilePair: vi.fn(),
  writeWorktreeFile: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../git', () => ({ changes, listFiles, mergeBase, readFilePair, writeWorktreeFile }));
vi.mock('../worktreeWatcher', () => ({ watchWorktree: () => () => undefined }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function invoke(channel: string, ...args: unknown[]): unknown {
  registerRepo(
    {
      window: () => null,
      worktreeFor: () => '/wt',
      project: () => Promise.resolve(null),
      sessions: {} as SessionManager,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
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
    mergeBase.mockResolvedValue('base');
  });

  test.each([
    { channel: 'repo:changes', args: ['t1'], fail: changes },
    { channel: 'repo:listFiles', args: ['t1'], fail: listFiles },
    { channel: 'repo:readFile', args: ['t1', 'a.ts'], fail: readFilePair },
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

  test('repo:writeFile writes the file in the tab worktree', async () => {
    // given
    writeWorktreeFile.mockResolvedValue(undefined);
    // when
    await invoke('repo:writeFile', 't1', 'a.ts', 'x');
    // then
    expect(writeWorktreeFile).toHaveBeenCalledWith('/wt', 'a.ts', 'x');
  });
});
