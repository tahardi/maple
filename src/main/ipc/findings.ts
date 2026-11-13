import { z } from 'zod';
import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { applyDecision, applyOverride } from '@shared/findings/applyDecision';
import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from '@main/app/log/log';
import { readFindings, readFindingsWithJson } from '@main/findings/readFindings';
import { queueFindings } from '@main/findings/queueFindings';
import { saveFindings } from '@main/findings/saveFindings';
import { readDecisions } from '@main/findings/decisions/readDecisions';
import { saveDecisions } from '@main/findings/decisions/saveDecisions';
import { trustDecisions } from '@main/findings/decisions/trustDecisions';
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

export function registerFindings(
  { sessions, status, window, findingsDir, decisionsDir }: IpcDeps,
  logger: Logger = appLogger,
): void {
  const trusted = async (file: FindingsFile, key: string): Promise<FindingsFile> =>
    trustDecisions(file, await readDecisions(decisionsDir, key));

  const change = async (
    tabId: string,
    operation: string,
    doing: string,
    edit: (file: FindingsFile) => FindingsFile,
  ): Promise<void> => {
    try {
      const key = sessions.get(tabId)?.cardKey ?? null;
      if (key === null) {
        throw new Error(`${doing}: tab has no card`);
      }
      await queueFindings(key, async () => {
        if (status.statuses().some((s) => s.tabId === tabId && s.dot === 'working')) {
          throw new Error(`${doing}: Claude is working`);
        }
        const read = await readFindingsWithJson(findingsDir, key);
        if (read === null) {
          throw new Error(`${doing}: no findings for ${key}`);
        }
        const { file, json } = read;
        if (file.card !== key) {
          throw new Error(`${doing}: ${key}.json is for ${file.card}`);
        }
        if (file.resume?.round === file.round) {
          throw new Error(`${doing}: Claude is applying your decisions`);
        }
        const edited = edit(await trusted(file, key));
        await saveFindings(findingsDir, edited, json);
        await saveDecisions(
          decisionsDir,
          key,
          edited.findings
            .filter((f) => f.decision !== null || f.severityOverride !== null)
            .map(({ id, identity, decision, severityOverride }) => ({ id, identity, decision, severityOverride })),
        );
      });
    } catch (err) {
      logger.warn('findings', 'failed', { operation, tabId, error: errorText(err) });
      throw err;
    }
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
      const read = await readFindings(findingsDir, key);
      const data = read === null ? null : await trusted(read, key);
      return { data, error: null, fetchedAt: new Date().toISOString() };
    } catch (err) {
      const error = errorText(err);
      logger.warn('findings', 'failed', { operation: 'findings:get', tabId, error });
      return { data: null, error, fetchedAt: null };
    }
  });

  handle('findings', 'decide', z.tuple([tabIdArg, findingIdArg, decisionArg]), (tabId, id, decision) =>
    change(tabId, 'findings:decide', 'deciding finding', (file) =>
      applyDecision(file, id, decision, new Date().toISOString()),
    ),
  );

  handle('findings', 'override', z.tuple([tabIdArg, findingIdArg, severityArg]), (tabId, id, severity) =>
    change(tabId, 'findings:override', 'overriding severity', (file) => applyOverride(file, id, severity)),
  );
}
