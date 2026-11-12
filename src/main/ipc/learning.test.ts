import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { IpcDeps } from './index';
import { registerLearning } from './learning';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle } }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const NOTE = '---\nclass: xss\ncomfortable: false\naliases: [a, b]\n---\n# XSS\n\n## Findings\n';

function register(vaultDir: string | null) {
  const watchVault = vi.fn<(dir: string) => void>();
  registerLearning({ watchVault } as unknown as IpcDeps, logger, () => Promise.resolve(vaultDir));
  const invoke = (channel: string, ...args: unknown[]): unknown => {
    const call = handle.mock.calls.findLast(([name]) => name === channel);
    if (!call) {
      throw new Error(`finding handler: ${channel} is not registered`);
    }
    return call[1]({} as IpcMainInvokeEvent, ...args);
  };
  return { invoke, watchVault };
}

describe('registerLearning', () => {
  let vault = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vault = mkdtempSync(join(tmpdir(), 'maple-learning-'));
    mkdirSync(join(vault, 'Learning', 'Security'), { recursive: true });
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), NOTE);
    writeFileSync(join(vault, 'Inbox.md'), NOTE);
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  test('learning:list returns summaries', async () => {
    // given
    const { invoke, watchVault } = register(vault);
    // when
    const got = await invoke('learning:list');
    // then
    expect(got).toEqual([
      {
        path: 'Learning/Security/xss.md',
        slug: 'xss',
        title: 'XSS',
        status: 'to-learn',
        comfortable: false,
        lastGrade: null,
        findings: 0,
        hasLesson: false,
        error: null,
      },
    ]);
    expect(watchVault).toHaveBeenCalledWith(vault);
  });

  test('learning:setComfortable writes the flag and keeps the rest of the note', async () => {
    // given
    const { invoke } = register(vault);
    // when
    await invoke('learning:setComfortable', 'Learning/Security/xss.md', true);
    // then
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(
      NOTE.replace('comfortable: false', 'comfortable: true'),
    );
  });

  test.each(['Inbox.md', '../x.md', 'Learning/Security/../../Inbox.md'])(
    'learning:setComfortable refuses a path outside Learning/Security: %s',
    async (path) => {
      // given
      const { invoke } = register(vault);
      // when
      const got = invoke('learning:setComfortable', path, true);
      // then
      await expect(got).rejects.toThrow(`marking comfortable: ${path} is not a lesson note`);
      expect(readFileSync(join(vault, 'Inbox.md'), 'utf8')).toBe(NOTE);
    },
  );

  test.each([
    { channel: 'learning:list', args: [] },
    { channel: 'learning:setComfortable', args: ['Learning/Security/xss.md', true] },
  ])('$channel rejects and logs without a vaultDir', async ({ channel, args }) => {
    // given
    const { invoke } = register(null);
    // when
    const got = invoke(channel, ...args);
    // then
    await expect(got).rejects.toThrow('reading lessons: no vaultDir in config');
    expect(logger.warn).toHaveBeenCalledWith('learning', 'failed', expect.objectContaining({ operation: channel }));
  });
});
