import type { ReviewComment } from '@shared/types';
import { z } from 'zod';
import type { Runner } from '@main/app/preflight';
import { headCommit } from './pr';

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

const threadsSchema = z.array(
  z.object({
    data: z.object({
      repository: z.object({
        pullRequest: z.object({
          reviewThreads: z.object({
            nodes: z.array(
              z.object({
                id: z.string(),
                isResolved: z.boolean(),
                comments: z.object({ nodes: z.array(z.object({ databaseId: z.number() })) }),
              }),
            ),
          }),
        }),
      }),
    }),
  }),
);

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const resolveMutation = (field: string) => `mutation($id: ID!) {
  ${field}(input: { threadId: $id }) { thread { id } }
}`;

const apiErrorSchema = z.object({
  message: z.string().optional(),
  errors: z.array(z.union([z.string(), z.object({ message: z.string() })])).optional(),
});

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

export async function commentOnLine(
  run: Runner,
  worktree: string,
  num: number,
  comment: { path: string; startLine: number | null; line: number; body: string },
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
      ...(comment.startLine === null
        ? []
        : ['-F', `start_line=${String(comment.startLine)}`, '-f', 'start_side=RIGHT']),
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

async function reviewThreads(
  run: Runner,
  worktree: string,
  num: number,
): Promise<Map<number, { threadId: string; resolved: boolean }>> {
  const { code, stdout, stderr } = await run(
    'gh',
    [
      'api',
      'graphql',
      '--paginate',
      '--slurp',
      '-F',
      'owner={owner}',
      '-F',
      'name={repo}',
      '-F',
      `number=${String(num)}`,
      '-f',
      `query=${THREADS_QUERY}`,
    ],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing review threads: ${stderr}`);
  }
  return new Map(
    threadsSchema
      .parse(JSON.parse(stdout))
      .flatMap((page) => page.data.repository.pullRequest.reviewThreads.nodes)
      .flatMap((t) =>
        t.comments.nodes
          .slice(0, 1)
          .map((first) => [first.databaseId, { threadId: t.id, resolved: t.isResolved }] as const),
      ),
  );
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
  const threads = await reviewThreads(run, worktree, num);
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
              ...(threads.get(c.in_reply_to_id ?? c.id) ?? { threadId: null, resolved: false }),
            },
          ]
        : [],
    );
}

export async function resolveThread(run: Runner, worktree: string, threadId: string, resolved: boolean): Promise<void> {
  const field = resolved ? 'resolveReviewThread' : 'unresolveReviewThread';
  const { code, stderr } = await run(
    'gh',
    ['api', 'graphql', '-f', `id=${threadId}`, '-f', `query=${resolveMutation(field)}`],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`${resolved ? 'resolving' : 'unresolving'} thread: ${stderr}`);
  }
}
