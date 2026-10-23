import { z } from 'zod';
import { appLogger, logFailure, type Logger } from '@main/app/log';
import { watchWorktree } from '@main/git/worktreeWatcher';
import { listNotes, readNote, writeNote } from '@main/vault/vault';
import { vaultWrites } from '@main/vault/vaultWrites';
import { vaultDir as configuredVaultDir } from './config';
import { send, type IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

export function registerVault(
  { sessions, window }: IpcDeps,
  logger: Logger = appLogger,
  vaultDir: () => Promise<string | null> = configuredVaultDir,
): void {
  async function requireVaultDir(): Promise<string> {
    const dir = await vaultDir();
    if (dir === null) {
      throw new Error('reading vault: no vaultDir in config');
    }
    return dir;
  }

  let watcher: { dir: string; stop: () => void } | null = null;
  function watchVault(dir: string): void {
    if (watcher?.dir === dir) {
      return;
    }
    watcher?.stop();
    watcher = null;
    try {
      const stop = watchWorktree(dir, () => {
        send(window(), 'vault:changed', null);
      });
      watcher = { dir, stop };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('vault', 'failed', { operation: 'watchWorktree', args: [dir], error });
    }
  }

  handle('vault:list', z.tuple([]), () =>
    logFailure(logger, 'vault', { operation: 'vault:list', args: [] }, async () => {
      const dir = await requireVaultDir();
      watchVault(dir);
      return listNotes(dir);
    }),
  );
  handle('vault:read', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:read', args: [path] }, async () =>
      readNote(await requireVaultDir(), path),
    ),
  );
  handle('vault:write', z.tuple([z.string().max(4096), z.string().max(2_097_152)]), (path, text) =>
    logFailure(logger, 'vault', { operation: 'vault:write', args: [path] }, async () =>
      writeNote(await requireVaultDir(), path, text),
    ),
  );
  handle('vault:written', z.tuple([tabIdArg]), (tabId) =>
    logFailure(logger, 'vault', { operation: 'vault:written', args: [tabId] }, async () => {
      const dir = await requireVaultDir();
      const tab = sessions.get(tabId);
      return tab === null ? [] : vaultWrites(tab.sessionId, dir);
    }),
  );
}
