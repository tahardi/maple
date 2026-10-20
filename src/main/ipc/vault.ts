import { z } from 'zod';
import { appLogger, logFailure, type Logger } from '../log';
import { listNotes, readNote } from '../vault';
import { vaultDir as configuredVaultDir } from './config';
import type { IpcDeps } from './index';
import { handle } from './validated';

export function registerVault(
  _deps: IpcDeps,
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
}
