import { z } from 'zod';
import { APPROVE_COMMENT, cardPrompt } from '@shared/prompts';
import type { Fetched, PrInfo } from '@shared/types';
import { currentBranch } from '../git';
import { commentOnPr, prForBranch } from '../github';
import { appLogger, type Logger } from '../log';
import { defaultRunner } from '../preflight';
import type { IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

async function lookup(worktree: string): Promise<PrInfo | null> {
  return prForBranch(defaultRunner, worktree, await currentBranch(worktree));
}

export function registerPr(deps: IpcDeps, logger: Logger = appLogger): void {
  const lastGood = new Map<string, Fetched<PrInfo>>();
  handle('pr:get', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<PrInfo>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      const fetched = { data: await lookup(worktree), error: null, fetchedAt: new Date().toISOString() };
      lastGood.set(tabId, fetched);
      return fetched;
    } catch (err) {
      const cached = lastGood.get(tabId);
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('gh', 'failed', { operation: 'pr:get', tabId, error });
      return { data: cached?.data ?? null, error, fetchedAt: cached?.fetchedAt ?? null };
    }
  });
  handle('pr:approve', z.tuple([tabIdArg]), async (tabId): Promise<void> => {
    try {
      const worktree = deps.worktreeFor(tabId);
      const cardKey = deps.sessions.get(tabId)?.cardKey ?? null;
      if (worktree === null || cardKey === null) {
        throw new Error('tab has no card worktree');
      }
      const pr = await lookup(worktree);
      if (pr?.state !== 'OPEN') {
        throw new Error('branch has no open PR');
      }
      await commentOnPr(defaultRunner, worktree, pr.number, APPROVE_COMMENT);
      deps.sessions.sendPrompt(tabId, cardPrompt(cardKey));
    } catch (err) {
      logger.warn('gh', 'failed', {
        operation: 'pr:approve',
        tabId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(`approving PR: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
