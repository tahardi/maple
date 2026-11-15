import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { commentOnLine, commentOnPr, prConversation, replyToComment, resolveThread, reviewComments } from './comments';
import type { Runner } from '@main/app/preflight';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Reply = { code: number; stdout: string; stderr: string };

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });

describe('commentOnLine', () => {
  const sha = 'a'.repeat(40);

  test('posts a review comment on the given commit', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('')));
    // when
    await commentOnLine(run, '/wt', 33, sha, { path: 'src/a.ts', startLine: null, line: 3, body: 'why?' });
    // then
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      'gh',
      [
        'api',
        '--method',
        'POST',
        'repos/{owner}/{repo}/pulls/33/comments',
        '-f',
        'body=why?',
        '-f',
        `commit_id=${sha}`,
        '-f',
        'path=src/a.ts',
        '-F',
        'line=3',
        '-f',
        'side=RIGHT',
      ],
      '/wt',
    );
  });

  test('posts a comment on a range of lines with its first line', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('')));
    // when
    await commentOnLine(run, '/wt', 33, sha, { path: 'src/a.ts', startLine: 1, line: 3, body: 'why?' });
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      [
        'api',
        '--method',
        'POST',
        'repos/{owner}/{repo}/pulls/33/comments',
        '-f',
        'body=why?',
        '-f',
        `commit_id=${sha}`,
        '-f',
        'path=src/a.ts',
        '-F',
        'line=3',
        '-f',
        'side=RIGHT',
        '-F',
        'start_line=1',
        '-f',
        'start_side=RIGHT',
      ],
      '/wt',
    );
  });

  test.each([
    {
      name: 'the reasons GitHub lists as strings',
      stdout: JSON.stringify({
        message: 'Validation Failed',
        errors: ['pull_request_review_thread.line must be part of the diff'],
        status: '422',
      }),
      want: 'commenting on line: pull_request_review_thread.line must be part of the diff',
    },
    {
      name: 'the reasons GitHub lists as objects',
      stdout: JSON.stringify({
        message: 'Validation Failed',
        errors: [{ resource: 'PullRequestReviewComment', code: 'custom', field: 'path', message: 'path is missing' }],
      }),
      want: 'commenting on line: path is missing',
    },
    {
      name: 'every reason joined when GitHub lists several',
      stdout: JSON.stringify({ message: 'Validation Failed', errors: ['line is wrong', { message: 'path is wrong' }] }),
      want: 'commenting on line: line is wrong; path is wrong',
    },
    {
      name: 'the GitHub message when the reasons are empty',
      stdout: JSON.stringify({ message: 'Validation Failed', errors: [] }),
      want: 'commenting on line: Validation Failed',
    },
    {
      name: 'stderr when the JSON is not a GitHub error',
      stdout: JSON.stringify({ errors: 5 }),
      want: 'commenting on line: gh: Validation Failed (HTTP 422)',
    },
    {
      name: 'the GitHub message when there are no reasons',
      stdout: JSON.stringify({ message: 'Not Found', status: '404' }),
      want: 'commenting on line: Not Found',
    },
    {
      name: 'stderr when stdout is not JSON',
      stdout: '',
      want: 'commenting on line: gh: Validation Failed (HTTP 422)',
    },
  ])('rejects with $name', async ({ stdout, want }) => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout, stderr: 'gh: Validation Failed (HTTP 422)' }));
    // when
    const result = commentOnLine(run, '/wt', 33, sha, { path: 'src/a.ts', startLine: null, line: 3, body: 'why?' });
    // then
    await expect(result).rejects.toThrow(new Error(want));
  });
});

describe('replyToComment', () => {
  test('posts a reply to the comment in the worktree', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('')));
    // when
    await replyToComment(run, '/wt', 33, 101, 'thanks');
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--method', 'POST', 'repos/{owner}/{repo}/pulls/33/comments/101/replies', '-f', 'body=thanks'],
      '/wt',
    );
  });

  test('rejects with the gh error', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'not found' }));
    // when
    const result = replyToComment(run, '/wt', 33, 101, 'thanks');
    // then
    await expect(result).rejects.toThrow('replying to comment: not found');
  });
});

describe('reviewComments', () => {
  const runner = (threads: Reply) =>
    vi.fn<Runner>((_cmd, args) =>
      Promise.resolve(args[1] === 'graphql' ? threads : ok(fixture('pr-review-comments.json'))),
    );

  test('returns the current comments on the new side of the diff with their thread', async () => {
    // given
    const run = runner(ok(fixture('pr-review-threads.json')));
    // when
    const result = await reviewComments(run, '/wt', 33);
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/pulls/33/comments'],
      '/wt',
    );
    expect(run).toHaveBeenCalledWith(
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
        'number=33',
        '-f',
        expect.stringContaining('reviewThreads(first: 100, after: $endCursor)'),
      ],
      '/wt',
    );
    expect(result).toEqual([
      {
        id: 101,
        replyTo: null,
        startLine: 1,
        path: 'src/a.ts',
        line: 3,
        author: 'tahardi',
        body: 'why?',
        threadId: 'PRRT_101',
        resolved: true,
      },
      {
        id: 102,
        replyTo: 101,
        startLine: null,
        path: 'src/a.ts',
        line: 3,
        author: 'tahardi',
        body: '**Claude:** explained in the PR body',
        threadId: 'PRRT_101',
        resolved: true,
      },
    ]);
  });

  test('leaves a comment with no matching thread open and unresolvable', async () => {
    // given
    const run = runner(
      ok(JSON.stringify([{ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }])),
    );
    // when
    const result = await reviewComments(run, '/wt', 33);
    // then
    expect(result.map((c) => [c.threadId, c.resolved])).toEqual([
      [null, false],
      [null, false],
    ]);
  });

  test('rejects with the gh error', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'offline' }));
    // when
    const result = reviewComments(run, '/wt', 33);
    // then
    await expect(result).rejects.toThrow('listing review comments: offline');
  });

  test('rejects with the gh error when the thread lookup fails', async () => {
    // given
    const run = runner({ code: 1, stdout: '', stderr: 'rate limited' });
    // when
    const result = reviewComments(run, '/wt', 33);
    // then
    await expect(result).rejects.toThrow('listing review threads: rate limited');
  });
});

describe('resolveThread', () => {
  test.each([
    { name: 'resolves', resolved: true, mutation: 'resolveReviewThread(input: { threadId: $id })' },
    { name: 'unresolves', resolved: false, mutation: 'unresolveReviewThread(input: { threadId: $id })' },
  ])('$name the thread in the worktree', async ({ resolved, mutation }) => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('')));
    // when
    await resolveThread(run, '/wt', 'PRRT_101', resolved);
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', 'graphql', '-f', 'id=PRRT_101', '-f', expect.stringContaining(` ${mutation}`)],
      '/wt',
    );
  });

  test.each([
    { resolved: true, want: 'resolving thread: not found' },
    { resolved: false, want: 'unresolving thread: not found' },
  ])('rejects with $want', async ({ resolved, want }) => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'not found' }));
    // when
    const result = resolveThread(run, '/wt', 'PRRT_101', resolved);
    // then
    await expect(result).rejects.toThrow(want);
  });
});

describe('prConversation', () => {
  const runner = () =>
    vi.fn<Runner>((_cmd, args) =>
      Promise.resolve(
        ok(fixture(String(args.at(-1)).endsWith('issues/33/comments') ? 'pr-issue-comments.json' : 'pr-reviews.json')),
      ),
    );

  test('returns comments and review summaries in time order, skipping empty and pending reviews', async () => {
    // given
    const run = runner();
    // when
    const result = await prConversation(run, '/wt', 33);
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/issues/33/comments'],
      '/wt',
    );
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/pulls/33/reviews'],
      '/wt',
    );
    expect(result.map((c) => c.url.split('#')[1])).toEqual([
      'issuecomment-2001',
      'pullrequestreview-3001',
      'issuecomment-2002',
      'issuecomment-2003',
    ]);
    expect(result[1]).toEqual({
      url: 'https://github.com/tahardi/maple/pull/33#pullrequestreview-3001',
      author: 'tahardi',
      at: '2026-10-25T10:30:00Z',
      body: 'Two nits, see the lines.',
    });
  });

  test.each([
    { name: 'a review whose summary is only whitespace', reviewBody: ' \n', commentBody: 'hi', want: ['hi'] },
    { name: 'a comment with no body', reviewBody: '', commentBody: null, want: [''] },
  ])('handles $name', async ({ reviewBody, commentBody, want }) => {
    // given
    const page = (entry: object) => ok(JSON.stringify([[entry]]));
    const run = vi.fn<Runner>((_cmd, args) =>
      Promise.resolve(
        String(args.at(-1)).endsWith('issues/33/comments')
          ? page({ user: { login: 'tahardi' }, body: commentBody, html_url: 'c', created_at: '2026-10-25T10:00:00Z' })
          : page({ user: { login: 'tahardi' }, body: reviewBody, html_url: 'r', submitted_at: '2026-10-25T11:00:00Z' }),
      ),
    );
    // when
    const result = await prConversation(run, '/wt', 33);
    // then
    expect(result.map((c) => c.body)).toEqual(want);
  });

  test('shows a deleted user as ghost', async () => {
    // given
    const run = runner();
    // when
    const result = await prConversation(run, '/wt', 33);
    // then
    expect(result.find((c) => c.url.endsWith('issuecomment-2003'))?.author).toBe('ghost');
  });

  test.each([
    { name: 'comments', path: 'issues/33/comments', want: 'listing PR comments: offline' },
    { name: 'reviews', path: 'pulls/33/reviews', want: 'listing reviews: offline' },
  ])('rejects with the gh error when listing $name fails', async ({ path, want }) => {
    // given
    const good = runner();
    const run = vi.fn<Runner>((cmd, args, cwd) =>
      String(args.at(-1)).endsWith(path)
        ? Promise.resolve({ code: 1, stdout: '', stderr: 'offline' })
        : good(cmd, args, cwd),
    );
    // when
    const result = prConversation(run, '/wt', 33);
    // then
    await expect(result).rejects.toThrow(new Error(want));
  });
});

describe('commentOnPr', () => {
  test('posts a top-level comment on the PR', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('')));
    // when
    await commentOnPr(run, '/wt', 33, 'ship it');
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--method', 'POST', 'repos/{owner}/{repo}/issues/33/comments', '-f', 'body=ship it'],
      '/wt',
    );
  });

  test('rejects with the GitHub reason', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '{"message":"Not Found"}', stderr: 'gh: 404' }));
    // when
    const result = commentOnPr(run, '/wt', 33, 'ship it');
    // then
    await expect(result).rejects.toThrow(new Error('commenting on PR: Not Found'));
  });
});
