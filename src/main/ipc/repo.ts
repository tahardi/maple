import { z } from 'zod';
import { changes, listFiles, mergeBase, readFilePair } from '../git';
import { appLogger, logFailure, type Logger } from '../log';
import { watchWorktree } from '../worktreeWatcher';
import { send, type IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

export function registerRepo(deps: IpcDeps, logger: Logger = appLogger): void {
  const watchers = new Map<string, { path: string; stop: () => void }>();

  function worktreeFor(tabId: string): string | null {
    const path = deps.worktreeFor(tabId);
    const watcher = watchers.get(tabId);
    if (watcher && watcher.path !== path) {
      watcher.stop();
      watchers.delete(tabId);
    }
    if (path !== null && !watchers.has(tabId)) {
      const stop = watchWorktree(path, () => {
        send(deps.window(), `repo:changed:${tabId}`, null);
      });
      watchers.set(tabId, { path, stop });
    }
    return path;
  }

  handle('repo:changes', z.tuple([tabIdArg]), (tabId) =>
    logFailure(logger, 'repo', { operation: 'repo:changes', args: [tabId] }, () => {
      const path = worktreeFor(tabId);
      return path === null ? null : changes(path);
    }),
  );
  handle('repo:listFiles', z.tuple([tabIdArg]), (tabId) =>
    logFailure(logger, 'repo', { operation: 'repo:listFiles', args: [tabId] }, () => {
      const path = worktreeFor(tabId);
      return path === null ? [] : listFiles(path);
    }),
  );
  handle('repo:readFile', z.tuple([tabIdArg, z.string().max(4096)]), (tabId, file) =>
    logFailure(logger, 'repo', { operation: 'repo:readFile', args: [tabId, file] }, async () => {
      const path = worktreeFor(tabId);
      if (path === null) {
        throw new Error(`reading file: tab ${tabId} has no worktree`);
      }
      return readFilePair(path, await mergeBase(path), file);
    }),
  );
}
