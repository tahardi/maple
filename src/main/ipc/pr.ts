import { z } from 'zod';
import { cardPrompt } from '@shared/prompts';
import type { DiffLines, FilePair } from '@shared/types/files';
import type { Fetched } from '@shared/types/app';
import type { PrInfo, Review, ReviewComment } from '@shared/types/github';
import { changedSince, currentBranch } from '@main/git/git';
import { commentOnLine, replyToComment, resolveThread, reviewComments } from '@main/github/comments';
import { ghRunner } from '@main/github/ghRunner';
import { approveAndMerge, diffLines, headCommit, prForBranch } from '@main/github/pr';
import { reviewFilePair, reviewFiles } from '@main/github/reviewDiff';
import { ghLogin, openFindings } from '@main/github/securityFindings';
import { appLogger, type Logger } from '@main/app/log';
import type { Runner as CommandRunner } from '@main/app/preflight';
import type { IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

const shaArg = z.string().regex(/^[0-9a-f]{40}$/);
const pathArg = z.string().min(1).max(4096);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerPr(deps: IpcDeps, logger: Logger = appLogger): void {
  const lastGood = new Map<string, Fetched<PrInfo>>();
  let login: Promise<string> | null = null;

  async function runnerFor(tabId: string): Promise<CommandRunner> {
    const key = deps.sessions.get(tabId)?.projectKey ?? null;
    const project = key === null ? null : await deps.project(key);
    if (project === null) {
      throw new Error(`finding project repo: unknown project ${key ?? tabId}`);
    }
    return ghRunner(project.repo);
  }

  async function lookup(tabId: string, worktree: string): Promise<PrInfo | null> {
    return prForBranch(await runnerFor(tabId), worktree, await currentBranch(worktree));
  }

  function myLogin(run: CommandRunner): Promise<string> {
    login ??= ghLogin(run).catch((err: unknown) => {
      login = null;
      throw err;
    });
    return login;
  }

  handle('pr:get', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<PrInfo>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      const fetched = { data: await lookup(tabId, worktree), error: null, fetchedAt: new Date().toISOString() };
      lastGood.set(tabId, fetched);
      return fetched;
    } catch (err) {
      const cached = lastGood.get(tabId);
      const error = message(err);
      logger.warn('gh', 'failed', { operation: 'pr:get', tabId, error });
      return { data: cached?.data ?? null, error, fetchedAt: cached?.fetchedAt ?? null };
    }
  });
  handle('pr:review', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<Review>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      const run = await runnerFor(tabId);
      const pr = await lookup(tabId, worktree);
      if (pr?.state !== 'OPEN') {
        return { data: null, error: null, fetchedAt: null };
      }
      const [review, findings] = await Promise.all([
        reviewFiles(run, pr.number),
        myLogin(run).then((me) => openFindings(run, pr.number, me)),
      ]);
      return { data: { ...review, findings }, error: null, fetchedAt: new Date().toISOString() };
    } catch (err) {
      const error = message(err);
      logger.warn('gh', 'failed', { operation: 'pr:review', tabId, error });
      return { data: null, error, fetchedAt: null };
    }
  });
  handle(
    'pr:readFile',
    z.tuple([tabIdArg, pathArg, pathArg.nullable(), shaArg, shaArg]),
    async (tabId, path, oldPath, baseSha, headSha): Promise<FilePair> => {
      try {
        return await reviewFilePair(await runnerFor(tabId), path, oldPath, baseSha, headSha);
      } catch (err) {
        logger.warn('gh', 'failed', { operation: 'pr:readFile', tabId, path, error: message(err) });
        throw err;
      }
    },
  );
  handle('pr:approve', z.tuple([tabIdArg, shaArg]), async (tabId, headSha): Promise<void> => {
    try {
      const worktree = deps.worktreeFor(tabId);
      const cardKey = deps.sessions.get(tabId)?.cardKey ?? null;
      if (worktree === null || cardKey === null) {
        throw new Error('approving PR: tab has no card worktree');
      }
      const run = await runnerFor(tabId).catch((err: unknown) => {
        throw new Error(`approving PR: ${message(err)}`);
      });
      const pr = await lookup(tabId, worktree).catch((err: unknown) => {
        throw new Error(`approving PR: ${message(err)}`);
      });
      if (pr?.state !== 'OPEN') {
        throw new Error('approving PR: branch has no open PR');
      }
      await approveAndMerge(run, pr.number, headSha);
      deps.sessions.sendPrompt(tabId, cardPrompt(cardKey));
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:approve', tabId, error: message(err) });
      throw err;
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
        const run = await runnerFor(tabId).catch((err: unknown) => {
          throw new Error(`commenting on line: ${message(err)}`);
        });
        const pr = await lookup(tabId, worktree).catch((err: unknown) => {
          throw new Error(`commenting on line: ${message(err)}`);
        });
        if (pr?.state !== 'OPEN') {
          throw new Error('commenting on line: branch has no open PR');
        }
        await commentOnLine(run, worktree, pr.number, { path, startLine, line, body });
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:comment',
          tabId,
          path,
          startLine,
          line,
          error: message(err),
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
        const run = await runnerFor(tabId).catch((err: unknown) => {
          throw new Error(`replying to comment: ${message(err)}`);
        });
        const pr = await lookup(tabId, worktree).catch((err: unknown) => {
          throw new Error(`replying to comment: ${message(err)}`);
        });
        if (pr?.state !== 'OPEN') {
          throw new Error('replying to comment: branch has no open PR');
        }
        await replyToComment(run, worktree, pr.number, commentId, body);
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:reply',
          tabId,
          commentId,
          error: message(err),
        });
        throw err;
      }
    },
  );
  handle(
    'pr:resolve',
    z.tuple([tabIdArg, z.string().min(1).max(200), z.boolean()]),
    async (tabId, threadId, resolved): Promise<void> => {
      const verb = resolved ? 'resolving' : 'unresolving';
      try {
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error(`${verb} thread: tab has no card worktree`);
        }
        const run = await runnerFor(tabId).catch((err: unknown) => {
          throw new Error(`${verb} thread: ${message(err)}`);
        });
        await resolveThread(run, worktree, threadId, resolved);
      } catch (err) {
        logger.warn('gh', 'failed', {
          operation: 'pr:resolve',
          tabId,
          threadId,
          resolved,
          error: message(err),
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
      const pr = await lookup(tabId, worktree);
      return pr === null ? [] : await reviewComments(await runnerFor(tabId), worktree, pr.number);
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:comments', tabId, error: message(err) });
      throw err;
    }
  });
  handle('pr:diffLines', z.tuple([tabIdArg]), async (tabId): Promise<DiffLines> => {
    const worktree = deps.worktreeFor(tabId);
    if (worktree === null) {
      return { ranges: {}, unpushed: [] };
    }
    try {
      const run = await runnerFor(tabId);
      const pr = await lookup(tabId, worktree);
      if (pr === null) {
        return { ranges: {}, unpushed: [] };
      }
      const [ranges, head] = await Promise.all([
        diffLines(run, worktree, pr.number),
        headCommit(run, worktree, pr.number),
      ]);
      return { ranges, unpushed: await changedSince(worktree, head) };
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:diffLines', tabId, error: message(err) });
      throw err;
    }
  });
}
