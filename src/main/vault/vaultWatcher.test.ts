import { beforeEach, describe, expect, test, vi } from 'vitest';
import { vaultWatcher } from './vaultWatcher';

const { watch } = vi.hoisted(() => {
  const stop = vi.fn();
  const state = { changed: (): void => undefined };
  return {
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

vi.mock('@main/git/worktreeWatcher', () => ({ watchWorktree: watch.watchWorktree }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('vaultWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calls onChange when the vault changes', () => {
    // given
    const onChange = vi.fn();
    vaultWatcher(onChange, logger)('/vault');
    // when
    watch.state.changed();
    // then
    expect(watch.watchWorktree).toHaveBeenCalledWith('/vault', onChange);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('watching the same dir twice watches it once', () => {
    // given
    const watchVault = vaultWatcher(vi.fn(), logger);
    // when
    watchVault('/vault');
    watchVault('/vault');
    // then
    expect(watch.watchWorktree).toHaveBeenCalledTimes(1);
  });

  test('a changed dir stops the old watcher', () => {
    // given
    const watchVault = vaultWatcher(vi.fn(), logger);
    watchVault('/vault');
    // when
    watchVault('/vault2');
    // then
    expect(watch.stop).toHaveBeenCalledTimes(1);
    expect(watch.watchWorktree).toHaveBeenLastCalledWith('/vault2', expect.any(Function));
  });

  test('logs at warn when watching fails', () => {
    // given
    watch.watchWorktree.mockImplementationOnce(() => {
      throw new Error('ENOSPC: System limit for number of file watchers reached');
    });
    // when
    vaultWatcher(vi.fn(), logger)('/vault');
    // then
    expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
      operation: 'watchWorktree',
      args: ['/vault'],
      error: 'ENOSPC: System limit for number of file watchers reached',
    });
  });

  test('a failed swap watches the old dir again when it comes back', () => {
    // given
    const watchVault = vaultWatcher(vi.fn(), logger);
    watchVault('/vault');
    watch.watchWorktree.mockImplementationOnce(() => {
      throw new Error('ENOSPC: System limit for number of file watchers reached');
    });
    watchVault('/vault2');
    // when
    watchVault('/vault');
    // then
    expect(watch.watchWorktree).toHaveBeenCalledTimes(3);
    expect(watch.watchWorktree).toHaveBeenLastCalledWith('/vault', expect.any(Function));
  });
});
