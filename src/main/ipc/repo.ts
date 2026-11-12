import { z } from 'zod';
import { changes, mergeBase } from '@main/git/changes';
import { currentBranch, repoName } from '@main/git/repoIdentity';
import { listFiles, readFilePair, searchFiles, writeWorktreeFile } from '@main/git/worktreeFiles';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { hasTryTarget } from '@main/git/makeTarget';
import { watchWorktree } from '@main/git/worktreeWatcher';
import { send, type IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

export function registerRepo(deps: IpcDeps, logger: Logger = appLogger): void {
  const watchers = new Map<string, { path: string; stop: () => void }>();
  deps.sessions.on('changed', (tabs) => {
    const open = new Set(tabs.map((tab) => tab.id));
    for (const [tabId, watcher] of watchers) {
      if (!open.has(tabId)) {
        watcher.stop();
        watchers.delete(tabId);
      }
    }
  });

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
  handle('repo:info', z.tuple([tabIdArg]), (tabId) =>
    logFailure(logger, 'repo', { operation: 'repo:info', args: [tabId] }, async () => {
      const path = worktreeFor(tabId);
      if (path === null) {
        return null;
      }
      const [name, branch, hasTry] = await Promise.all([repoName(path), currentBranch(path), hasTryTarget(path)]);
      return { name, branch, hasTry };
    }),
  );
  handle('repo:readFile', z.tuple([tabIdArg, z.string().max(4096)]), (tabId, file) =>
    logFailure(logger, 'repo', { operation: 'repo:readFile', args: [tabId, file] }, async () => {
      const path = worktreeFor(tabId);
      if (path === null) {
        throw new Error(`reading file: tab ${tabId} has no worktree`);
      }
      return readFilePair(path, (await mergeBase(path)) ?? 'HEAD', file);
    }),
  );
  handle('repo:writeFile', z.tuple([tabIdArg, z.string().max(4096), z.string().max(2_097_152)]), (tabId, file, text) =>
    logFailure(logger, 'repo', { operation: 'repo:writeFile', args: [tabId, file] }, () => {
      const path = worktreeFor(tabId);
      if (path === null) {
        throw new Error(`writing file: tab ${tabId} has no worktree`);
      }
      return writeWorktreeFile(path, file, text);
    }),
  );
  handle('repo:search', z.tuple([tabIdArg, z.string().min(1).max(200)]), (tabId, query) =>
    logFailure(logger, 'repo', { operation: 'repo:search', args: [tabId, query] }, () => {
      const path = worktreeFor(tabId);
      return path === null ? [] : searchFiles(path, query);
    }),
  );
}
