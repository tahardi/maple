import { ipcMain } from 'electron';
import { changes, listFiles, mergeBase, readFilePair } from '../git';
import { watchWorktree } from '../worktreeWatcher';
import { send, type IpcDeps } from './index';

export function registerRepo(deps: IpcDeps): void {
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

  ipcMain.handle('repo:changes', (_event, tabId: string) => {
    const path = worktreeFor(tabId);
    return path === null ? null : changes(path);
  });
  ipcMain.handle('repo:listFiles', (_event, tabId: string) => {
    const path = worktreeFor(tabId);
    return path === null ? [] : listFiles(path);
  });
  ipcMain.handle('repo:readFile', async (_event, tabId: string, file: string) => {
    const path = worktreeFor(tabId);
    if (path === null) {
      throw new Error(`reading file: tab ${tabId} has no worktree`);
    }
    return readFilePair(path, await mergeBase(path), file);
  });
}
