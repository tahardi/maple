import { hunkLines } from '@shared/hunkLines';
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
      id: z.number(),
      in_reply_to_id: z.number().optional(),
      start_line: z.number().nullable().optional(),
      path: z.string(),
      line: z.number().nullable(),
      side: z.string(),
      body: z.string(),
      user: z.object({ login: z.string() }),
    }),
  ),
);

const filesSchema = z.array(z.array(z.object({ filename: z.string(), patch: z.string().optional() })));

const apiErrorSchema = z.object({
  message: z.string().optional(),
  errors: z.array(z.union([z.string(), z.object({ message: z.string() })])).optional(),
});

const pendingExitCode = 8;

function apiReason(stdout: string, stderr: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return stderr;
  }
  const body = apiErrorSchema.safeParse(parsed);
  if (!body.success) {
    return stderr;
  }
  const reasons = (body.data.errors ?? []).map((e) => (typeof e === 'string' ? e : e.message));
  return reasons.length > 0 ? reasons.join('; ') : (body.data.message ?? stderr);
}

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

export async function headCommit(run: Runner, worktree: string, num: number): Promise<string> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['pr', 'view', String(num), '--json', 'headRefOid', '--jq', '.headRefOid'],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`reading PR head: ${stderr}`);
  }
  return stdout.trim();
}

export async function diffLines(
  run: Runner,
  worktree: string,
  num: number,
): Promise<Record<string, readonly [number, number][]>> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/pulls/${String(num)}/files`],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing PR files: ${stderr}`);
  }
  return Object.fromEntries(
    filesSchema
      .parse(JSON.parse(stdout))
      .flat()
      .map((f) => [f.filename, hunkLines(f.patch ?? '')]),
  );
}

export async function commentOnLine(
  run: Runner,
  worktree: string,
  num: number,
  comment: { path: string; line: number; body: string },
): Promise<void> {
  const head = await headCommit(run, worktree, num).catch((err: unknown) => {
    throw new Error(`commenting on line: ${err instanceof Error ? err.message : String(err)}`);
  });
  const { code, stdout, stderr } = await run(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${String(num)}/comments`,
      '-f',
      `body=${comment.body}`,
      '-f',
      `commit_id=${head}`,
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
    throw new Error(`commenting on line: ${apiReason(stdout, stderr)}`);
  }
}

export async function replyToComment(
  run: Runner,
  worktree: string,
  num: number,
  commentId: number,
  body: string,
): Promise<void> {
  const { code, stderr } = await run(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${String(num)}/comments/${String(commentId)}/replies`,
      '-f',
      `body=${body}`,
    ],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`replying to comment: ${stderr}`);
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
      c.line !== null && c.side === 'RIGHT'
        ? [
            {
              id: c.id,
              replyTo: c.in_reply_to_id ?? null,
              startLine: c.start_line ?? null,
              path: c.path,
              line: c.line,
              author: c.user.login,
              body: c.body,
            },
          ]
        : [],
    );
}
