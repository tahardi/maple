import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { commentOnLine, replyToComment, resolveThread, reviewComments } from './comments';
import type { Runner } from '@main/app/preflight';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Reply = { code: number; stdout: string; stderr: string };

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });

describe('commentOnLine', () => {
  test('posts a review comment on the PR head commit', async () => {
    // given
    const run = vi.fn<Runner>((_cmd, args) => Promise.resolve(ok(args[0] === 'pr' ? 'abc123\n' : '')));
    // when
    await commentOnLine(run, '/wt', 33, { path: 'src/a.ts', startLine: null, line: 3, body: 'why?' });
    // then
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'view', '33', '--json', 'headRefOid', '--jq', '.headRefOid'], '/wt');
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
        'commit_id=abc123',
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
    const run = vi.fn<Runner>((_cmd, args) => Promise.resolve(ok(args[0] === 'pr' ? 'abc123\n' : '')));
    // when
    await commentOnLine(run, '/wt', 33, { path: 'src/a.ts', startLine: 1, line: 3, body: 'why?' });
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
        'commit_id=abc123',
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
    const run = vi.fn<Runner>((_cmd, args) =>
      Promise.resolve(
        args[0] === 'pr' ? ok('abc123\n') : { code: 1, stdout, stderr: 'gh: Validation Failed (HTTP 422)' },
      ),
    );
    // when
    const result = commentOnLine(run, '/wt', 33, { path: 'src/a.ts', startLine: null, line: 3, body: 'why?' });
    // then
    await expect(result).rejects.toThrow(new Error(want));
  });

  test('rejects and posts nothing when the head commit lookup fails', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'no pull requests found' }));
    // when
    const result = commentOnLine(run, '/wt', 33, { path: 'src/a.ts', startLine: null, line: 3, body: 'why?' });
    // then
    await expect(result).rejects.toThrow('commenting on line: reading PR head: no pull requests found');
    expect(run).toHaveBeenCalledTimes(1);
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
