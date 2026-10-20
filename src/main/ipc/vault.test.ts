import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import { registerVault } from './vault';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, listNotes, readNote } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  listNotes: vi.fn(),
  readNote: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../vault', () => ({ listNotes, readNote }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function invoke(vaultDir: string | null, channel: string, ...args: unknown[]): unknown {
  registerVault(
    {
      window: () => null,
      worktreeFor: () => null,
      project: () => Promise.resolve(null),
      sessions: {} as SessionManager,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
    },
    logger,
    () => Promise.resolve(vaultDir),
  );
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler: ${channel} is not registered`);
  }
  return call[1]({} as IpcMainInvokeEvent, ...args);
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

  test.each([
    { channel: 'vault:list', args: [] },
    { channel: 'vault:read', args: ['a.md'] },
  ])('$channel rejects and logs without a vaultDir', async ({ channel, args }) => {
    // given
    const vaultDir = null;
    // when
    const got = invoke(vaultDir, channel, ...args);
    // then
    await expect(got).rejects.toThrow('reading vault: no vaultDir in config');
    expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
      operation: channel,
      args,
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
