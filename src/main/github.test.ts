import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { commentOnLine, commentOnPr, prForBranch, reviewComments } from './github';
import type { Runner } from './preflight';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../test/fixtures/gh', name), 'utf8');

type Reply = { code: number; stdout: string; stderr: string };

function fakeRunner(list: Reply, checks: Reply) {
  return vi.fn<Runner>((_cmd, args) => Promise.resolve(args[1] === 'list' ? list : checks));
}

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });

describe('prForBranch', () => {
  test('returns the PR with parsed sections and a checks summary', async () => {
    // given
    const run = fakeRunner(ok(fixture('pr-list.json')), { code: 8, stdout: fixture('pr-checks.json'), stderr: '' });
    // when
    const pr = await prForBranch(run, '/wt', 'mpl-13-github-client');
    // then
    expect(pr).toEqual({
      number: 33,
      url: 'https://github.com/tahardi/maple/pull/33',
      title: '[MPL-13] GitHub Client',
      state: 'OPEN',
      deviations: 'None',
      needsTaylor: '- Try it on device',
      cardImpacts: '- MPL-15: rename foo to bar',
      body:
        '## Describe your changes\n\nAdds the GitHub client.\n\n## Deviations from the card\n\nNone\n\n' +
        '## Needs Taylor\n\n- Try it on device\n\n## Card impacts\n\n- MPL-15: rename foo to bar\n',
      checks: { passed: 4, failed: 0, pending: 1, total: 5 },
    });
    expect(run).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--head',
        'mpl-13-github-client',
        '--state',
        'all',
        '--limit',
        '1',
        '--json',
        'number,url,title,state,body',
      ],
      '/wt',
    );
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'checks', '33', '--json', 'bucket'], '/wt');
  });

  test('counts failed and cancelled checks as failed', async () => {
    // given
    const buckets = JSON.stringify([{ bucket: 'fail' }, { bucket: 'cancel' }, { bucket: 'pass' }]);
    const run = fakeRunner(ok(fixture('pr-list.json')), ok(buckets));
    // when
    const pr = await prForBranch(run, '/wt', 'b');
    // then
    expect(pr?.checks).toEqual({ passed: 1, failed: 2, pending: 0, total: 3 });
  });

  test('returns all zeros when no checks are reported yet', async () => {
    // given
    const run = fakeRunner(ok(fixture('pr-list.json')), {
      code: 1,
      stdout: '',
      stderr: "no checks reported on the 'b' branch",
    });
    // when
    const pr = await prForBranch(run, '/wt', 'b');
    // then
    expect(pr?.checks).toEqual({ passed: 0, failed: 0, pending: 0, total: 0 });
  });

  test('returns null when the branch has no PR', async () => {
    // given
    const run = fakeRunner(ok('[]'), ok('[]'));
    // when
    const pr = await prForBranch(run, '/wt', 'b');
    // then
    expect(pr).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      name: 'gh pr list',
      list: { code: 1, stdout: '', stderr: 'boom' },
      checks: ok('[]'),
      message: 'listing PRs: boom',
    },
    {
      name: 'gh pr checks',
      list: ok(fixture('pr-list.json')),
      checks: { code: 4, stdout: '', stderr: 'auth' },
      message: 'checking PR: auth',
    },
  ])('rejects when $name fails', async ({ list, checks, message }) => {
    // given
    const run = fakeRunner(list, checks);
    // when
    const result = prForBranch(run, '/wt', 'b');
    // then
    await expect(result).rejects.toThrow(message);
  });
});

describe('commentOnPr', () => {
  test('runs gh pr comment in the worktree', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('')));
    // when
    await commentOnPr(run, '/wt', 33, 'LGTM');
    // then
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'comment', '33', '--body', 'LGTM'], '/wt');
  });

  test('rejects when gh pr comment fails', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'closed' }));
    // when
    const result = commentOnPr(run, '/wt', 33, 'LGTM');
    // then
    await expect(result).rejects.toThrow('commenting on PR: closed');
  });
});

describe('commentOnLine', () => {
  test('posts a review comment on the PR head commit', async () => {
    // given
    const run = vi.fn<Runner>((_cmd, args) => Promise.resolve(ok(args[0] === 'pr' ? 'abc123\n' : '')));
    // when
    await commentOnLine(run, '/wt', 33, { path: 'src/a.ts', line: 3, body: 'why?' });
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

  test('rejects with the gh error', async () => {
    // given
    const run = vi.fn<Runner>((_cmd, args) =>
      Promise.resolve(
        args[0] === 'pr' ? ok('abc123\n') : { code: 1, stdout: '', stderr: 'line must be part of the diff' },
      ),
    );
    // when
    const result = commentOnLine(run, '/wt', 33, { path: 'src/a.ts', line: 3, body: 'why?' });
    // then
    await expect(result).rejects.toThrow('commenting on line: line must be part of the diff');
  });

  test('rejects and posts nothing when the head commit lookup fails', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'no pull requests found' }));
    // when
    const result = commentOnLine(run, '/wt', 33, { path: 'src/a.ts', line: 3, body: 'why?' });
    // then
    await expect(result).rejects.toThrow('commenting on line: no pull requests found');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('reviewComments', () => {
  test('returns the current comments on the new side of the diff', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok(fixture('pr-review-comments.json'))));
    // when
    const result = await reviewComments(run, '/wt', 33);
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/pulls/33/comments'],
      '/wt',
    );
    expect(result).toEqual([
      { path: 'src/a.ts', line: 3, author: 'tahardi', body: 'why?' },
      { path: 'src/a.ts', line: 3, author: 'tahardi', body: '**Claude:** explained in the PR body' },
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
});
