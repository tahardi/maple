import { z } from 'zod';
import { APPROVE_COMMENT, cardPrompt } from '@shared/prompts';
import type { DiffLines, Fetched, PrInfo, ReviewComment } from '@shared/types';
import { changedSince, currentBranch } from '@main/git/git';
import {
  commentOnLine,
  commentOnPr,
  diffLines,
  headCommit,
  prForBranch,
  replyToComment,
  resolveThread,
  reviewComments,
} from '@main/github/github';
import { appLogger, type Logger } from '@main/app/log';
import { defaultRunner } from '@main/app/preflight';
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
    z
      .tuple([
        tabIdArg,
        z.string().min(1).max(4096),
        z.number().int().min(1).nullable(),
        z.number().int().min(1),
        z.string().min(1).max(65_536),
      ])
      .refine(([, , startLine, line]) => startLine === null || startLine < line),
    async (tabId, path, startLine, line, body): Promise<void> => {
      try {
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error('commenting on line: tab has no card worktree');
        }
        const pr = await lookup(worktree).catch((err: unknown) => {
          throw new Error(`commenting on line: ${err instanceof Error ? err.message : String(err)}`);
        });
        if (pr?.state !== 'OPEN') {
          throw new Error('commenting on line: branch has no open PR');
        }
        await commentOnLine(defaultRunner, worktree, pr.number, { path, startLine, line, body });
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:comment',
          tabId,
          path,
          startLine,
          line,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  );
  handle(
    'pr:reply',
    z.tuple([tabIdArg, z.number().int().min(1), z.string().min(1).max(65_536)]),
    async (tabId, commentId, body): Promise<void> => {
      try {
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error('replying to comment: tab has no card worktree');
        }
        const pr = await lookup(worktree).catch((err: unknown) => {
          throw new Error(`replying to comment: ${err instanceof Error ? err.message : String(err)}`);
        });
        if (pr?.state !== 'OPEN') {
          throw new Error('replying to comment: branch has no open PR');
        }
        await replyToComment(defaultRunner, worktree, pr.number, commentId, body);
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:reply',
          tabId,
          commentId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  );
  handle(
    'pr:resolve',
    z.tuple([tabIdArg, z.string().min(1).max(200), z.boolean()]),
    async (tabId, threadId, resolved): Promise<void> => {
      try {
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error(`${resolved ? 'resolving' : 'unresolving'} thread: tab has no card worktree`);
        }
        await resolveThread(defaultRunner, worktree, threadId, resolved);
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:resolve',
          tabId,
          threadId,
          resolved,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
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
  handle('pr:diffLines', z.tuple([tabIdArg]), async (tabId): Promise<DiffLines> => {
    const worktree = deps.worktreeFor(tabId);
    if (worktree === null) {
      return { ranges: {}, unpushed: [] };
    }
    try {
      const pr = await lookup(worktree);
      if (pr === null) {
        return { ranges: {}, unpushed: [] };
      }
      const [ranges, head] = await Promise.all([
        diffLines(defaultRunner, worktree, pr.number),
        headCommit(defaultRunner, worktree, pr.number),
      ]);
      return { ranges, unpushed: await changedSince(worktree, head) };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('gh', 'failed', { operation: 'pr:diffLines', tabId, error });
      throw err;
    }
  });
}
