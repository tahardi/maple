import { z } from 'zod';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { vaultDir as configuredVaultDir } from '@main/app/config/configCache';
import { listLessons } from '@main/learning/notes/listLessons';
import { gradeQuiz } from '@main/learning/lesson/gradeQuiz';
import { parseLesson } from '@main/learning/lesson/parseLesson';
import { readFrontmatter, writeFrontmatter } from '@main/learning/notes/frontmatter';
import { readNote, writeNote } from '@main/vault/vault';
import { isLessonPath } from '@shared/learning/lessonPath';
import type { IpcDeps } from './index';
import { handle } from './handle';

const lessonPath = z.string().refine(isLessonPath);

function today(): string {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

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
  handle('learning', 'read', z.tuple([lessonPath]), (path) =>
    logFailure(logger, 'learning', { operation: 'learning:read', args: [path] }, async () => {
      const dir = await requireVaultDir();
      return parseLesson(path, await readNote(dir, path)).lesson;
    }),
  );
  handle('learning', 'grade', z.tuple([lessonPath, z.array(z.int().min(0)).min(1).max(5)]), (path, answers) =>
    logFailure(logger, 'learning', { operation: 'learning:grade', args: [path] }, async () => {
      const dir = await requireVaultDir();
      const text = await readNote(dir, path);
      const { key } = parseLesson(path, text);
      if (key === null) {
        throw new Error(`grading quiz: ${path} has no quiz`);
      }
      const result = gradeQuiz(key, answers);
      const { grades } = readFrontmatter(text).data;
      const grade = { date: today(), score: result.score, total: result.total };
      const fields = { grades: [...(Array.isArray(grades) ? (grades as unknown[]) : []), grade], status: 'learned' };
      await writeNote(dir, path, writeFrontmatter(text, fields));
      return result;
    }),
  );
}
