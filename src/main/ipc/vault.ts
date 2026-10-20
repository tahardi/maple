import { z } from 'zod';
import { appLogger, logFailure, type Logger } from '../log';
import { listNotes, readNote } from '../vault';
import { vaultWrites } from '../vaultWrites';
import { vaultDir as configuredVaultDir } from './config';
import type { IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

export function registerVault(
  { sessions }: IpcDeps,
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

  handle('vault:list', z.tuple([]), () =>
    logFailure(logger, 'vault', { operation: 'vault:list', args: [] }, async () => listNotes(await requireVaultDir())),
  );
  handle('vault:read', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:read', args: [path] }, async () =>
      readNote(await requireVaultDir(), path),
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
