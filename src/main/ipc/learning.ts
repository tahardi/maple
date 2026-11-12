import { z } from 'zod';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { vaultDir as configuredVaultDir } from '@main/app/config/configCache';
import { listLessons } from '@main/learning/notes/listLessons';
import { writeFrontmatter } from '@main/learning/notes/frontmatter';
import { readNote, writeNote } from '@main/vault/vault';
import { isLessonPath } from '@shared/learning/lessonPath';
import type { IpcDeps } from './index';
import { handle } from './handle';

export function registerLearning(
  { watchVault }: IpcDeps,
  logger: Logger = appLogger,
  vaultDir: () => Promise<string | null> = configuredVaultDir,
): void {
  async function requireVaultDir(): Promise<string> {
    const dir = await vaultDir();
    if (dir === null) {
      throw new Error('reading lessons: no vaultDir in config');
    }
    return dir;
  }

  handle('learning', 'list', z.tuple([]), () =>
    logFailure(logger, 'learning', { operation: 'learning:list', args: [] }, async () => {
      const dir = await requireVaultDir();
      watchVault(dir);
      return listLessons(dir);
    }),
  );
  handle('learning', 'setComfortable', z.tuple([z.string().max(4096), z.boolean()]), (path, comfortable) =>
    logFailure(
      logger,
      'learning',
      { operation: 'learning:setComfortable', args: [path, String(comfortable)] },
      async () => {
        const dir = await requireVaultDir();
        if (!isLessonPath(path)) {
          throw new Error(`marking comfortable: ${path} is not a lesson note`);
        }
        await writeNote(dir, path, writeFrontmatter(await readNote(dir, path), { comfortable }));
      },
    ),
  );
}
