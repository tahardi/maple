import { z } from 'zod';
import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from '@main/app/log/log';
import { readFindings } from '@main/findings/readFindings';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import type { IpcDeps } from './index';
import { tabIdArg } from './args';
import { emit } from './emit';
import { handle } from './handle';

export function registerFindings({ sessions, window, findingsDir }: IpcDeps, logger: Logger = appLogger): void {
  try {
    watchWorktrees(findingsDir, () => {
      emit(window(), 'findings', 'onChanged');
    });
  } catch (err) {
    logger.warn('findings', 'failed', { operation: 'watchWorktrees', args: [findingsDir], error: errorText(err) });
  }

  handle('findings', 'get', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<FindingsFile>> => {
    const key = sessions.get(tabId)?.cardKey ?? null;
    if (key === null) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      const data = await readFindings(findingsDir, key);
      return { data, error: null, fetchedAt: new Date().toISOString() };
    } catch (err) {
      const error = errorText(err);
      logger.warn('findings', 'failed', { operation: 'findings:get', tabId, error });
      return { data: null, error, fetchedAt: null };
    }
  });
}
