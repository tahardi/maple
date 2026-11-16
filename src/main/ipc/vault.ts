import { shell } from 'electron';
import { z } from 'zod';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { readSnapshot } from '@main/vault/snapshots';
import {
  createFolder,
  createNote,
  duplicateNote,
  listNotes,
  openInObsidian,
  readNote,
  renameNote,
  trashNote,
  writeNote,
} from '@main/vault/vault';
import { vaultWrites } from '@main/vault/vaultWrites';
import { vaultDir as configuredVaultDir } from '@main/app/config/configCache';
import type { IpcDeps } from './index';
import { tabIdArg } from './args';
import { handle } from './handle';

export function registerVault(
  { sessions, watchVault }: IpcDeps,
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

  handle('vault', 'list', z.tuple([]), () =>
    logFailure(logger, 'vault', { operation: 'vault:list', args: [] }, async () => {
      const dir = await requireVaultDir();
      watchVault(dir);
      return listNotes(dir);
    }),
  );
  handle('vault', 'read', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:read', args: [path] }, async () =>
      readNote(await requireVaultDir(), path),
    ),
  );
  handle('vault', 'write', z.tuple([z.string().max(4096), z.string().max(2_097_152)]), (path, text) =>
    logFailure(logger, 'vault', { operation: 'vault:write', args: [path] }, async () =>
      writeNote(await requireVaultDir(), path, text),
    ),
  );
  handle('vault', 'createNote', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:createNote', args: [path] }, async () =>
      createNote(await requireVaultDir(), path),
    ),
  );
  handle('vault', 'createFolder', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:createFolder', args: [path] }, async () =>
      createFolder(await requireVaultDir(), path),
    ),
  );
  handle('vault', 'trash', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:trash', args: [path] }, async () =>
      trashNote(await requireVaultDir(), path, (full) => shell.trashItem(full)),
    ),
  );
  handle('vault', 'rename', z.tuple([z.string().max(4096), z.string().max(4096)]), (from, to) =>
    logFailure(logger, 'vault', { operation: 'vault:rename', args: [from, to] }, async () =>
      renameNote(await requireVaultDir(), from, to),
    ),
  );
  handle('vault', 'duplicate', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:duplicate', args: [path] }, async () =>
      duplicateNote(await requireVaultDir(), path),
    ),
  );
  handle('vault', 'openInObsidian', z.tuple([z.string().max(4096)]), (path) =>
    logFailure(logger, 'vault', { operation: 'vault:openInObsidian', args: [path] }, async () =>
      openInObsidian(await requireVaultDir(), path, (uri) => shell.openExternal(uri)),
    ),
  );
  handle('vault', 'written', z.tuple([tabIdArg]), (tabId) =>
    logFailure(logger, 'vault', { operation: 'vault:written', args: [tabId] }, async () => {
      const dir = await requireVaultDir();
      const tab = sessions.get(tabId);
      return tab === null ? [] : vaultWrites(tab.sessionId, dir);
    }),
  );
  handle('vault', 'before', z.tuple([tabIdArg, z.string().max(4096)]), (tabId, path) =>
    logFailure(logger, 'vault', { operation: 'vault:before', args: [tabId, path] }, async () => {
      await requireVaultDir();
      const tab = sessions.get(tabId);
      return tab === null ? null : readSnapshot(tab.sessionId, path);
    }),
  );
}
