import { z } from 'zod';
import { cardPrompt } from '@shared/prompts/cardPrompt';
import { prRepo } from '@shared/github/prRepo';
import { tabWorktrees } from '@shared/worktree/tabWorktrees';
import type { DiffLines } from '@shared/types/files/diffLines';
import type { FilePair } from '@shared/types/files/filePair';
import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import type { TabState } from '@shared/types/tabs/tabState';
import { currentBranch } from '@main/git/git';
import { commentOnLine, replyToComment, resolveThread, reviewComments } from '@main/github/comments';
import { ghRunner, projectRunner } from '@main/github/ghRunner';
import { approveAndMerge, diffLines, prForBranch } from '@main/github/pr';
import { reviewFilePair, reviewFiles } from '@main/github/reviewDiff';
import { ghLogin, openFindings } from '@main/github/securityFindings';
import { appLogger, type Logger } from '@main/app/log/log';
import { prEvents, type PrEvents } from '@main/events/PrEvents';
import type { Runner as CommandRunner } from '@main/app/preflight';
import type { IpcDeps } from './index';
import { handle, tabIdArg } from './validated';

const shaArg = z.string().regex(/^[0-9a-f]{40}$/);
const pathArg = z.string().min(1).max(4096);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerPr(deps: IpcDeps, logger: Logger = appLogger, events: PrEvents = prEvents): void {
  let login: Promise<string> | null = null;

  async function runnerFor(tabId: string, worktree = deps.worktreeFor(tabId)): Promise<CommandRunner> {
    const branch = worktree === null ? null : await currentBranch(worktree);
    return projectRunner(deps.project, deps.sessions.get(tabId)?.projectKey ?? null, branch, worktree);
  }

  async function lookup(run: CommandRunner, worktree: string): Promise<PrInfo | null> {
    return prForBranch(run, worktree, await currentBranch(worktree));
  }

  async function holdsCard(tabId: string, worktree: string): Promise<boolean> {
    const tab = deps.sessions.get(tabId);
    const others = (tab === null ? [] : tabWorktrees(tab)).filter((path) => path !== worktree);
    try {
      const prs = await Promise.all(others.map(async (path) => lookup(await runnerFor(tabId, path), path)));
      const open = prs.flatMap((p) => (p?.state === 'OPEN' ? [p.number] : []));
      if (open.length > 0) {
        logger.info('gh', 'waiting for other PRs', { tabId, open });
      }
      return open.length > 0;
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:approve', tabId, error: message(err) });
      return true;
    }
  }

  function myLogin(run: CommandRunner): Promise<string> {
    login ??= ghLogin(run).catch((err: unknown) => {
      login = null;
      throw err;
    });
    return login;
  }

  function record(tabId: string, write: (tab: TabState) => Promise<void>): void {
    const tab = deps.sessions.get(tabId);
    if (tab !== null) {
      void write(tab);
    }
  }

  handle('pr:get', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<PrInfo>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    return deps.prs.latest(tabId, worktree);
  });
  handle('pr:review', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<Review>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      const { data: pr, error } = await deps.prs.latest(tabId, worktree);
      if (pr === null && error !== null) {
        throw new Error(error);
      }
      if (pr?.state !== 'OPEN') {
        return { data: null, error: null, fetchedAt: null };
      }
      const run = ghRunner(prRepo(pr.url));
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
      const pr = await lookup(run, worktree).catch((err: unknown) => {
        throw new Error(`approving PR: ${message(err)}`);
      });
      if (pr?.state !== 'OPEN') {
        throw new Error('approving PR: branch has no open PR');
      }
      await approveAndMerge(run, pr.number, headSha, cardKey);
      deps.prs.refresh();
      record(tabId, (tab) => events.approved(tab, pr));
      logger.info('gh', 'merged', { tabId, repo: prRepo(pr.url), number: pr.number, headSha });
      if (!(await holdsCard(tabId, worktree))) {
        deps.sessions.sendPrompt(tabId, cardPrompt(cardKey));
      }
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
        shaArg,
      ])
      .refine(([, , startLine, line]) => startLine === null || startLine < line),
    async (tabId, path, startLine, line, body, headSha): Promise<void> => {
      try {
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error('commenting on line: tab has no card worktree');
        }
        const run = await runnerFor(tabId).catch((err: unknown) => {
          throw new Error(`commenting on line: ${message(err)}`);
        });
        const pr = await lookup(run, worktree).catch((err: unknown) => {
          throw new Error(`commenting on line: ${message(err)}`);
        });
        if (pr?.state !== 'OPEN') {
          throw new Error('commenting on line: branch has no open PR');
        }
        await commentOnLine(run, worktree, pr.number, headSha, { path, startLine, line, body });
        record(tabId, (tab) => events.commented(tab, pr, body.length));
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
        const pr = await lookup(run, worktree).catch((err: unknown) => {
          throw new Error(`replying to comment: ${message(err)}`);
        });
        if (pr?.state !== 'OPEN') {
          throw new Error('replying to comment: branch has no open PR');
        }
        await replyToComment(run, worktree, pr.number, commentId, body);
        record(tabId, (tab) => events.replied(tab, pr, commentId, body.length));
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
        record(tabId, (tab) => events.resolved(tab, threadId, resolved));
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
      const { data: pr, error } = await deps.prs.latest(tabId, worktree);
      if (pr === null && error !== null) {
        throw new Error(error);
      }
      return pr === null ? [] : await reviewComments(ghRunner(prRepo(pr.url)), worktree, pr.number);
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:comments', tabId, error: message(err) });
      throw err;
    }
  });
  handle('pr:diffLines', z.tuple([tabIdArg, shaArg, shaArg]), async (tabId, baseSha, headSha): Promise<DiffLines> => {
    const worktree = deps.worktreeFor(tabId);
    if (worktree === null) {
      return { ranges: {} };
    }
    try {
      return { ranges: await diffLines(await runnerFor(tabId), worktree, baseSha, headSha) };
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:diffLines', tabId, error: message(err) });
      throw err;
    }
  });
}
