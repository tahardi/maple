import { parsePrBody } from '@shared/prBody';
import type { ChecksSummary, PrInfo, ReviewComment } from '@shared/types';
import { z } from 'zod';
import type { Runner } from './preflight';

const listSchema = z.array(
  z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
    state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
    body: z.string(),
  }),
);

const checksSchema = z.array(z.object({ bucket: z.string() }));

const reviewCommentsSchema = z.array(
  z.array(
    z.object({
      path: z.string(),
      line: z.number().nullable(),
      side: z.string(),
      body: z.string(),
      user: z.object({ login: z.string() }),
    }),
  ),
);

const pendingExitCode = 8;

async function checksFor(run: Runner, worktree: string, num: number): Promise<ChecksSummary> {
  const { code, stdout, stderr } = await run('gh', ['pr', 'checks', String(num), '--json', 'bucket'], worktree);
  if (code !== 0 && code !== pendingExitCode) {
    if (stderr.includes('no checks reported')) {
      return { passed: 0, failed: 0, pending: 0, total: 0 };
    }
    throw new Error(`checking PR: ${stderr}`);
  }
  const buckets = checksSchema.parse(JSON.parse(stdout)).map((c) => c.bucket);
  const count = (names: string[]) => buckets.filter((b) => names.includes(b)).length;
  return {
    passed: count(['pass', 'skipping']),
    failed: count(['fail', 'cancel']),
    pending: count(['pending']),
    total: buckets.length,
  };
}

export async function prForBranch(run: Runner, worktree: string, branch: string): Promise<PrInfo | null> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,url,title,state,body'],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing PRs: ${stderr}`);
  }
  const pr = listSchema.parse(JSON.parse(stdout)).at(0);
  if (!pr) {
    return null;
  }
  return { ...pr, ...parsePrBody(pr.body), checks: await checksFor(run, worktree, pr.number) };
}

export async function commentOnPr(run: Runner, worktree: string, num: number, body: string): Promise<void> {
  const { code, stderr } = await run('gh', ['pr', 'comment', String(num), '--body', body], worktree);
  if (code !== 0) {
    throw new Error(`commenting on PR: ${stderr}`);
  }
}

export async function commentOnLine(
  run: Runner,
  worktree: string,
  num: number,
  comment: { path: string; line: number; body: string },
): Promise<void> {
  const head = await run('gh', ['pr', 'view', String(num), '--json', 'headRefOid', '--jq', '.headRefOid'], worktree);
  if (head.code !== 0) {
    throw new Error(`commenting on line: ${head.stderr}`);
  }
  const { code, stderr } = await run(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${String(num)}/comments`,
      '-f',
      `body=${comment.body}`,
      '-f',
      `commit_id=${head.stdout.trim()}`,
      '-f',
      `path=${comment.path}`,
      '-F',
      `line=${String(comment.line)}`,
      '-f',
      'side=RIGHT',
    ],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`commenting on line: ${stderr}`);
  }
}

export async function reviewComments(run: Runner, worktree: string, num: number): Promise<ReviewComment[]> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/pulls/${String(num)}/comments`],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing review comments: ${stderr}`);
  }
  return reviewCommentsSchema
    .parse(JSON.parse(stdout))
    .flat()
    .flatMap((c) =>
      c.line !== null && c.side === 'RIGHT' ? [{ path: c.path, line: c.line, author: c.user.login, body: c.body }] : [],
    );
}
