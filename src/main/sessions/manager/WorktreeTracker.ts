import type { Logger } from '@main/app/log/log';
import { findWorktrees } from '@main/git/findWorktrees';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import { errorText } from '@shared/errors/errorText';

type WorktreeTrackerDeps = {
  worktreesDir: () => string;
  current: (tabId: string) => string[] | null;
  found: (tabId: string, paths: string[]) => void;
  logger: Logger;
};

export class WorktreeTracker {
  private readonly stops = new Map<string, () => void>();

  constructor(private readonly deps: WorktreeTrackerDeps) {}

  track(tabId: string, cardKey: string): void {
    const worktreesDir = this.deps.worktreesDir();
    const log = this.deps.logger;
    let done = false;
    let stop: () => void = () => undefined;
    const check = async () => {
      const paths = await findWorktrees(worktreesDir, cardKey).catch((err: unknown) => {
        log.warn('worktree', 'failed', { operation: 'findWorktrees', cardKey, error: errorText(err) });
        return undefined;
      });
      const current = this.deps.current(tabId);
      if (done || paths === undefined || current === null) {
        return;
      }
      if (paths.length === current.length && paths.every((path, i) => path === current[i])) {
        return;
      }
      if (paths.length === 0) {
        log.info('worktree', 'gone', { cardKey });
      } else {
        log.info('worktree', 'found', { cardKey, paths });
      }
      this.deps.found(tabId, paths);
    };
    try {
      stop = watchWorktrees(worktreesDir, () => void check());
    } catch (err) {
      log.warn('worktree', 'failed', { operation: 'watchWorktrees', cardKey, error: errorText(err) });
    }
    this.stops.set(tabId, () => {
      done = true;
      stop();
    });
    void check();
  }

  stop(tabId: string): void {
    this.stops.get(tabId)?.();
    this.stops.delete(tabId);
  }

  stopAll(): void {
    for (const tabId of [...this.stops.keys()]) {
      this.stop(tabId);
    }
  }
}
