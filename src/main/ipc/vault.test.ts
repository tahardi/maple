import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import { registerVault } from './vault';
import type { StartQueue } from '@main/sessions/StartQueue';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, listNotes, readNote, readSnapshot, writeNote, vaultWrites } = vi.hoisted(() => {
  return {
    handle: vi.fn<(channel: string, handler: Handler) => void>(),
    listNotes: vi.fn(),
    readNote: vi.fn(),
    readSnapshot: vi.fn(),
    writeNote: vi.fn(),
    vaultWrites: vi.fn(),
  };
});

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/vault/vault', () => ({ listNotes, readNote, writeNote }));
vi.mock('@main/vault/vaultWrites', () => ({ vaultWrites }));
vi.mock('@main/vault/snapshots', () => ({ readSnapshot }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const win = {} as BrowserWindow;
const watchVault = vi.fn<(dir: string) => void>();

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
      configLoaded: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
      setSeen: () => Promise.resolve(),
      seen: () => Promise.resolve({}),
      startQueue: new EventEmitter() as StartQueue,
      prs: { latest: () => Promise.resolve({ data: null, error: null, fetchedAt: null }), refresh: () => undefined },
      jira: new Promise<never>(() => undefined),
      jiraCreds: new Promise<never>(() => undefined),
      watchVault,
      findingsDir: '/tmp/maple/findings',
      decisionsDir: '/tmp/maple/decisions',
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

  test('vault:list watches the vault dir', async () => {
    // given
    listNotes.mockResolvedValue([]);
    // when
    await invoke('/vault', 'vault:list');
    // then
    expect(watchVault).toHaveBeenCalledWith('/vault');
  });

  test('vault:before returns the copy saved before the tab session first wrote the note', async () => {
    // given
    readSnapshot.mockResolvedValue('## Draft\n');
    // when
    const got = await invoke('/vault', 'vault:before', 't1', 'Spike.md');
    // then
    expect(got).toBe('## Draft\n');
    expect(readSnapshot).toHaveBeenCalledWith('s1', 'Spike.md');
  });

  test('vault:before rejects and logs when the copy cannot be read', async () => {
    // given
    readSnapshot.mockRejectedValue(new Error('reading snapshot: path is outside the snapshots'));
    // when
    const got = invoke('/vault', 'vault:before', 't1', '../x.md');
    // then
    await expect(got).rejects.toThrow('reading snapshot: path is outside the snapshots');
    expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
      operation: 'vault:before',
      args: ['t1', '../x.md'],
      error: 'reading snapshot: path is outside the snapshots',
    });
  });

  test('vault:before returns null for an unknown tab', async () => {
    // given
    const tabId = 'gone';
    // when
    const got = await invoke('/vault', 'vault:before', tabId, 'Spike.md');
    // then
    expect(got).toBeNull();
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  test.each([
    { channel: 'vault:list', args: [], logged: [] },
    { channel: 'vault:read', args: ['a.md'], logged: ['a.md'] },
    { channel: 'vault:written', args: ['t1'], logged: ['t1'] },
    { channel: 'vault:before', args: ['t1', 'a.md'], logged: ['t1', 'a.md'] },
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
