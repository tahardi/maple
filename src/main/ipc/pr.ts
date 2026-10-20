import { z } from 'zod';
import { APPROVE_COMMENT, cardPrompt } from '@shared/prompts';
import type { Fetched, PrInfo, ReviewComment } from '@shared/types';
import { currentBranch } from '../git';
import { commentOnLine, commentOnPr, prForBranch, reviewComments } from '../github';
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
  handle(
    'pr:comment',
    z.tuple([tabIdArg, z.string().min(1).max(4096), z.number().int().min(1), z.string().min(1).max(65_536)]),
    async (tabId, path, line, body): Promise<void> => {
      try {
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error('tab has no card worktree');
        }
        const pr = await lookup(worktree);
        if (pr?.state !== 'OPEN') {
          throw new Error('branch has no open PR');
        }
        await commentOnLine(defaultRunner, worktree, pr.number, { path, line, body });
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:comment',
          tabId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new Error(`commenting on line: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
  handle('pr:comments', z.tuple([tabIdArg]), async (tabId): Promise<ReviewComment[]> => {
    const worktree = deps.worktreeFor(tabId);
    if (worktree === null) {
      return [];
    }
    try {
      const pr = await lookup(worktree);
      return pr === null ? [] : await reviewComments(defaultRunner, worktree, pr.number);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('gh', 'failed', { operation: 'pr:comments', tabId, error });
      throw err;
    }
  });
}
