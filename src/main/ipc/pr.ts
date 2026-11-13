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
import { commentOnLine, replyToComment, resolveThread, reviewComments } from '@main/github/comments';
import { ghRunner } from '@main/github/ghRunner';
import { approveAndMerge, diffLines } from '@main/github/pr';
import { reviewFilePair, reviewFiles } from '@main/github/reviewDiff';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { prEvents, type PrEvents } from '@main/events/PrEvents';
import type { Runner as CommandRunner } from '@main/app/preflight';
import type { IpcDeps } from './index';
import { tabIdArg } from './args';
import { handle } from './handle';
import { errorText } from '@shared/errors/errorText';

const shaArg = z.string().regex(/^[0-9a-f]{40}$/);
const pathArg = z.string().min(1).max(4096);

export function registerPr(deps: IpcDeps, logger: Logger = appLogger, events: PrEvents = prEvents): void {
  async function lookup(tabId: string, worktree: string): Promise<PrInfo | null> {
    const { data, error } = await deps.prs.latest(tabId, worktree);
    if (data === null && error !== null) {
      throw new Error(error);
    }
    return data;
  }

  async function prRunner(tabId: string, doing: string): Promise<CommandRunner> {
    const worktree = deps.worktreeFor(tabId);
    const pr =
      worktree === null
        ? null
        : await lookup(tabId, worktree).catch((err: unknown) => {
            throw new Error(`${doing}: ${errorText(err)}`);
          });
    if (pr === null) {
      throw new Error(`${doing}: tab has no PR`);
    }
    return ghRunner(prRepo(pr.url));
  }

  async function openPrFor(tabId: string, verb: string): Promise<{ worktree: string; run: CommandRunner; pr: PrInfo }> {
    const worktree = deps.worktreeFor(tabId);
    if (worktree === null) {
      throw new Error(`${verb}: tab has no card worktree`);
    }
    const pr = await lookup(tabId, worktree).catch((err: unknown) => {
      throw new Error(`${verb}: ${errorText(err)}`);
    });
    if (pr?.state !== 'OPEN') {
      throw new Error(`${verb}: branch has no open PR`);
    }
    return { worktree, run: ghRunner(prRepo(pr.url)), pr };
  }

  async function holdsCard(tabId: string, worktree: string): Promise<boolean> {
    const tab = deps.sessions.get(tabId);
    const others = (tab === null ? [] : tabWorktrees(tab)).filter((path) => path !== worktree);
    try {
      const prs = await Promise.all(others.map((path) => lookup(tabId, path)));
      const open = prs.flatMap((p) => (p?.state === 'OPEN' ? [p.number] : []));
      if (open.length > 0) {
        logger.info('gh', 'waiting for other PRs', { tabId, open });
      }
      return open.length > 0;
    } catch (err) {
      logger.warn('gh', 'failed', { operation: 'pr:approve', tabId, error: errorText(err) });
      return true;
    }
  }

  function record(tabId: string, write: (tab: TabState) => Promise<void>): void {
    const tab = deps.sessions.get(tabId);
    if (tab !== null) {
      void write(tab);
    }
  }

  handle('pr', 'get', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<PrInfo>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    return deps.prs.latest(tabId, worktree);
  });
  handle('pr', 'review', z.tuple([tabIdArg]), async (tabId): Promise<Fetched<Review>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      return await logFailure(logger, 'gh', { operation: 'pr:review', tabId }, async (): Promise<Fetched<Review>> => {
        const { data: pr, error } = await deps.prs.latest(tabId, worktree);
        if (pr === null && error !== null) {
          throw new Error(error);
        }
        if (pr?.state !== 'OPEN') {
          return { data: null, error: null, fetchedAt: null };
        }
        const run = ghRunner(prRepo(pr.url));
        const review = await reviewFiles(run, pr.number);
        return { data: review, error: null, fetchedAt: new Date().toISOString() };
      });
    } catch (err) {
      return { data: null, error: errorText(err), fetchedAt: null };
    }
  });
  handle(
    'pr',
    'readFile',
    z.tuple([tabIdArg, pathArg, pathArg.nullable(), shaArg, shaArg]),
    (tabId, path, oldPath, baseSha, headSha): Promise<FilePair> =>
      logFailure(logger, 'gh', { operation: 'pr:readFile', tabId, path }, async () =>
        reviewFilePair(await prRunner(tabId, 'reading PR file'), path, oldPath, baseSha, headSha),
      ),
  );
  handle('pr', 'approve', z.tuple([tabIdArg, shaArg]), (tabId, headSha): Promise<void> =>
    logFailure(logger, 'gh', { operation: 'pr:approve', tabId }, async () => {
      const cardKey = deps.sessions.get(tabId)?.cardKey ?? null;
      if (cardKey === null) {
        throw new Error('approving PR: tab has no card worktree');
      }
      const { worktree, run, pr } = await openPrFor(tabId, 'approving PR');
      await approveAndMerge(run, pr.number, headSha, cardKey);
      deps.prs.refresh();
      record(tabId, (tab) => events.approved(tab, pr));
      logger.info('gh', 'merged', { tabId, repo: prRepo(pr.url), number: pr.number, headSha });
      if (!(await holdsCard(tabId, worktree))) {
        deps.sessions.sendPrompt(tabId, cardPrompt(cardKey));
      }
    }),
  );
  handle(
    'pr',
    'comment',
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
    (tabId, path, startLine, line, body, headSha): Promise<void> =>
      logFailure(logger, 'gh', { operation: 'pr:comment', tabId, path, startLine, line }, async () => {
        const { worktree, run, pr } = await openPrFor(tabId, 'commenting on line');
        await commentOnLine(run, worktree, pr.number, headSha, { path, startLine, line, body });
        record(tabId, (tab) => events.commented(tab, pr, body.length));
      }),
  );
  handle(
    'pr',
    'reply',
    z.tuple([tabIdArg, z.number().int().min(1), z.string().min(1).max(65_536)]),
    (tabId, commentId, body): Promise<void> =>
      logFailure(logger, 'gh', { operation: 'pr:reply', tabId, commentId }, async () => {
        const { worktree, run, pr } = await openPrFor(tabId, 'replying to comment');
        await replyToComment(run, worktree, pr.number, commentId, body);
        record(tabId, (tab) => events.replied(tab, pr, commentId, body.length));
      }),
  );
  handle(
    'pr',
    'resolve',
    z.tuple([tabIdArg, z.string().min(1).max(200), z.boolean()]),
    (tabId, threadId, resolved): Promise<void> =>
      logFailure(logger, 'gh', { operation: 'pr:resolve', tabId, threadId, resolved }, async () => {
        const verb = resolved ? 'resolving' : 'unresolving';
        const worktree = deps.worktreeFor(tabId);
        if (worktree === null) {
          throw new Error(`${verb} thread: tab has no card worktree`);
        }
        const run = await prRunner(tabId, `${verb} thread`);
        await resolveThread(run, worktree, threadId, resolved);
        record(tabId, (tab) => events.resolved(tab, threadId, resolved));
      }),
  );
  handle('pr', 'comments', z.tuple([tabIdArg]), async (tabId): Promise<ReviewComment[]> => {
    const worktree = deps.worktreeFor(tabId);
    if (worktree === null) {
      return [];
    }
    return logFailure(logger, 'gh', { operation: 'pr:comments', tabId }, async () => {
      const { data: pr, error } = await deps.prs.latest(tabId, worktree);
      if (pr === null && error !== null) {
        throw new Error(error);
      }
      return pr === null ? [] : reviewComments(ghRunner(prRepo(pr.url)), worktree, pr.number);
    });
  });
  handle(
    'pr',
    'diffLines',
    z.tuple([tabIdArg, shaArg, shaArg]),
    async (tabId, baseSha, headSha): Promise<DiffLines> => {
      const worktree = deps.worktreeFor(tabId);
      if (worktree === null) {
        return { ranges: {} };
      }
      return logFailure(logger, 'gh', { operation: 'pr:diffLines', tabId }, async () => ({
        ranges: await diffLines(await prRunner(tabId, 'listing PR files'), worktree, baseSha, headSha),
      }));
    },
  );
}
