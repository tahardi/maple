import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '@main/sessions/sessions';
import type { StatusEngine } from '@main/sessions/status';
import type { Terminals } from '@main/sessions/terminals';
import { registerVault } from './vault';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, listNotes, readNote, writeNote, vaultWrites, watch } = vi.hoisted(() => {
  const stop = vi.fn();
  const state = { changed: (): void => undefined };
  return {
    handle: vi.fn<(channel: string, handler: Handler) => void>(),
    listNotes: vi.fn(),
    readNote: vi.fn(),
    writeNote: vi.fn(),
    vaultWrites: vi.fn(),
    watch: {
      stop,
      state,
      watchWorktree: vi.fn((_dir: string, cb: () => void) => {
        state.changed = cb;
        return stop;
      }),
    },
  };
});

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/vault/vault', () => ({ listNotes, readNote, writeNote }));
vi.mock('@main/vault/vaultWrites', () => ({ vaultWrites }));
vi.mock('@main/git/worktreeWatcher', () => ({ watchWorktree: watch.watchWorktree }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const sendToWindow = vi.fn();
const win = { isDestroyed: () => false, webContents: { send: sendToWindow } } as unknown as BrowserWindow;

function register(vaultDir: () => Promise<string | null>) {
  registerVault(
    {
      window: () => win,
      worktreeFor: () => null,
      project: () => Promise.resolve(null),
      sessions: { get: (tabId: string) => (tabId === 't1' ? { sessionId: 's1' } : null) } as SessionManager,
      terminals: {} as Terminals,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
    },
    logger,
    vaultDir,
  );
  return (channel: string, ...args: unknown[]): unknown => {
    const call = handle.mock.calls.find(([name]) => name === channel);
    if (!call) {
      throw new Error(`finding handler: ${channel} is not registered`);
    }
    return call[1]({} as IpcMainInvokeEvent, ...args);
  };
}

function invoke(vaultDir: string | null, channel: string, ...args: unknown[]): unknown {
  return register(() => Promise.resolve(vaultDir))(channel, ...args);
}

describe('registerVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('vault:list lists notes in the configured dir', async () => {
    // given
    listNotes.mockResolvedValue([{ path: 'a.md', modifiedAt: '2026-10-19T12:00:00.000Z' }]);
    // when
    const got = await invoke('/vault', 'vault:list');
    // then
    expect(got).toEqual([{ path: 'a.md', modifiedAt: '2026-10-19T12:00:00.000Z' }]);
    expect(listNotes).toHaveBeenCalledWith('/vault');
  });

  test('vault:read reads the note from the configured dir', async () => {
    // given
    readNote.mockResolvedValue('# A\n');
    // when
    const got = await invoke('/vault', 'vault:read', 'a.md');
    // then
    expect(got).toBe('# A\n');
    expect(readNote).toHaveBeenCalledWith('/vault', 'a.md');
  });

  test('vault:written lists the notes the tab session wrote', async () => {
    // given
    vaultWrites.mockResolvedValue(['Spike.md']);
    // when
    const got = await invoke('/vault', 'vault:written', 't1');
    // then
    expect(got).toEqual(['Spike.md']);
    expect(vaultWrites).toHaveBeenCalledWith('s1', '/vault');
  });

  test('vault:written returns nothing for an unknown tab', async () => {
    // given
    const tabId = 'gone';
    // when
    const got = await invoke('/vault', 'vault:written', tabId);
    // then
    expect(got).toEqual([]);
    expect(vaultWrites).not.toHaveBeenCalled();
  });

  test('vault:write writes the note in the configured dir', async () => {
    // given
    writeNote.mockResolvedValue(undefined);
    // when
    await invoke('/vault', 'vault:write', 'a.md', '# A\n');
    // then
    expect(writeNote).toHaveBeenCalledWith('/vault', 'a.md', '# A\n');
  });

  test('vault:write logs the path but not the text', async () => {
    // given
    writeNote.mockRejectedValue(new Error('writing note: path is outside the vault'));
    // when
    const got = invoke('/vault', 'vault:write', 'a.md', 'secret text');
    // then
    await expect(got).rejects.toThrow('writing note: path is outside the vault');
    expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
      operation: 'vault:write',
      args: ['a.md'],
      error: 'writing note: path is outside the vault',
    });
  });

  test('vault:list watches the vault and sends vault:changed on a change', async () => {
    // given
    listNotes.mockResolvedValue([]);
    await invoke('/vault', 'vault:list');
    // when
    watch.state.changed();
    // then
    expect(watch.watchWorktree).toHaveBeenCalledWith('/vault', expect.any(Function));
    expect(sendToWindow).toHaveBeenCalledWith('vault:changed', null);
  });

  test('listing the vault twice watches it once', async () => {
    // given
    listNotes.mockResolvedValue([]);
    const call = register(() => Promise.resolve('/vault'));
    // when
    await call('vault:list');
    await call('vault:list');
    // then
    expect(watch.watchWorktree).toHaveBeenCalledTimes(1);
  });

  test('a changed vaultDir stops the old watcher', async () => {
    // given
    listNotes.mockResolvedValue([]);
    let dir = '/vault';
    const call = register(() => Promise.resolve(dir));
    await call('vault:list');
    // when
    dir = '/vault2';
    await call('vault:list');
    // then
    expect(watch.stop).toHaveBeenCalledTimes(1);
    expect(watch.watchWorktree).toHaveBeenLastCalledWith('/vault2', expect.any(Function));
  });

  test('vault:list still lists notes and logs at warn when watching fails', async () => {
    // given
    listNotes.mockResolvedValue([{ path: 'a.md', modifiedAt: '2026-10-19T12:00:00.000Z' }]);
    watch.watchWorktree.mockImplementationOnce(() => {
      throw new Error('ENOSPC: System limit for number of file watchers reached');
    });
    // when
    const got = await invoke('/vault', 'vault:list');
    // then
    expect(got).toEqual([{ path: 'a.md', modifiedAt: '2026-10-19T12:00:00.000Z' }]);
    expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
      operation: 'watchWorktree',
      args: ['/vault'],
      error: 'ENOSPC: System limit for number of file watchers reached',
    });
  });

  test('a failed watcher swap watches the old dir again when it comes back', async () => {
    // given
    listNotes.mockResolvedValue([]);
    let dir = '/vault';
    const call = register(() => Promise.resolve(dir));
    await call('vault:list');
    dir = '/vault2';
    watch.watchWorktree.mockImplementationOnce(() => {
      throw new Error('ENOSPC: System limit for number of file watchers reached');
    });
    await call('vault:list');
    // when
    dir = '/vault';
    await call('vault:list');
    // then
    expect(watch.watchWorktree).toHaveBeenCalledTimes(3);
    expect(watch.watchWorktree).toHaveBeenLastCalledWith('/vault', expect.any(Function));
  });

  test.each([
    { channel: 'vault:list', args: [], logged: [] },
    { channel: 'vault:read', args: ['a.md'], logged: ['a.md'] },
    { channel: 'vault:written', args: ['t1'], logged: ['t1'] },
    { channel: 'vault:write', args: ['a.md', 'x'], logged: ['a.md'] },
  ])('$channel rejects and logs without a vaultDir', async ({ channel, args, logged }) => {
    // given
    const vaultDir = null;
    // when
    const got = invoke(vaultDir, channel, ...args);
    // then
    await expect(got).rejects.toThrow('reading vault: no vaultDir in config');
    expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
      operation: channel,
      args: logged,
      error: 'reading vault: no vaultDir in config',
    });
  });

  test('vault:read rejects a path longer than 4096', () => {
    // given
    const path = 'a'.repeat(4097);
    // when
    const got = () => invoke('/vault', 'vault:read', path);
    // then
    expect(got).toThrow('handling vault:read: arguments are invalid');
    expect(readNote).not.toHaveBeenCalled();
  });
});
