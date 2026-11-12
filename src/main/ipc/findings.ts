import { z } from 'zod';
import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { applyDecision, applyOverride } from '@shared/findings/applyDecision';
import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from '@main/app/log/log';
import { readFindings } from '@main/findings/readFindings';
import { saveFindings } from '@main/findings/saveFindings';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import type { IpcDeps } from './index';
import { tabIdArg } from './args';
import { emit } from './emit';
import { handle } from './handle';

const findingIdArg = z.string().min(1).max(20);
const severityArg = z.enum(['high', 'medium', 'low']).nullable();
const decisionArg = z
  .object({
    kind: z.enum(['fix-now', 'fix-later', 'accept-risk', 'not-real']),
    reason: z.string().min(1).max(500).nullable(),
  })
  .nullable();

export function registerFindings({ sessions, status, window, findingsDir }: IpcDeps, logger: Logger = appLogger): void {
  const change = async (tabId: string, doing: string, edit: (file: FindingsFile) => FindingsFile): Promise<void> => {
    if (status.statuses().some((s) => s.tabId === tabId && s.dot === 'working')) {
      throw new Error(`${doing}: Claude is working`);
    }
    const key = sessions.get(tabId)?.cardKey ?? null;
    if (key === null) {
      throw new Error(`${doing}: tab has no card`);
    }
    const file = await readFindings(findingsDir, key);
    if (file === null) {
      throw new Error(`${doing}: no findings for ${key}`);
    }
    if (file.card !== key) {
      throw new Error(`${doing}: ${key}.json is for ${file.card}`);
    }
    await saveFindings(findingsDir, edit(file));
  };

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

  handle('findings', 'decide', z.tuple([tabIdArg, findingIdArg, decisionArg]), (tabId, id, decision) =>
    change(tabId, 'deciding finding', (file) => applyDecision(file, id, decision, new Date().toISOString())),
  );

  handle('findings', 'override', z.tuple([tabIdArg, findingIdArg, severityArg]), (tabId, id, severity) =>
    change(tabId, 'overriding severity', (file) => applyOverride(file, id, severity)),
  );
}
