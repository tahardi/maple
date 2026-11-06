import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { approveAndMerge, diffLines, headCommit, prForBranch } from './pr';
import type { Runner } from '@main/app/preflight';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Reply = { code: number; stdout: string; stderr: string };

function fakeRunner(list: Reply, checks: Reply) {
  return vi.fn<Runner>((_cmd, args) => Promise.resolve(args[1] === 'list' ? list : checks));
}

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });

describe('prForBranch', () => {
  test('returns the PR with parsed sections and a checks summary', async () => {
    // given
    const jobs = 'https://github.com/tahardi/maple/actions/runs/18620000001/job';
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
      checks: {
        passed: 4,
        failed: 0,
        pending: 1,
        total: 5,
        runs: [
          { name: 'format', bucket: 'pass', link: `${jobs}/53090000001` },
          { name: 'lint', bucket: 'pass', link: `${jobs}/53090000002` },
          { name: 'typecheck', bucket: 'pass', link: `${jobs}/53090000003` },
          { name: 'unit-test', bucket: 'skipping', link: `${jobs}/53090000004` },
          { name: 'e2e', bucket: 'pending', link: `${jobs}/53090000005` },
        ],
      },
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
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'checks', '33', '--json', 'name,bucket,link'], '/wt');
  });

  test('counts failed and cancelled checks as failed', async () => {
    // given
    const runs = [
      { name: 'lint', bucket: 'fail', link: 'https://github.com/tahardi/maple/actions/runs/1/job/1' },
      { name: 'e2e', bucket: 'cancel', link: 'https://github.com/tahardi/maple/actions/runs/1/job/2' },
      { name: 'format', bucket: 'pass', link: 'https://github.com/tahardi/maple/actions/runs/1/job/3' },
    ];
    const run = fakeRunner(ok(fixture('pr-list.json')), ok(JSON.stringify(runs)));
    // when
    const pr = await prForBranch(run, '/wt', 'b');
    // then
    expect(pr?.checks).toEqual({ passed: 1, failed: 2, pending: 0, total: 3, runs });
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
    expect(pr?.checks).toEqual({ passed: 0, failed: 0, pending: 0, total: 0, runs: [] });
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

describe('diffLines', () => {
  test('maps each file to the new-side ranges of its hunks', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok(fixture('pr-files.json'))));
    // when
    const result = await diffLines(run, '/wt', 53);
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/pulls/53/files'],
      '/wt',
    );
    expect(result).toEqual({
      '.github/workflows/ci.yml': [[86, 96]],
      'README.md': [[35, 49]],
      'playwright.config.ts': [[1, 10]],
      'test/e2e/fixtures/bin/claude': [],
      'test/e2e/fixtures/config/config.json': [],
      'test/e2e/fixtures/jira.env': [],
      'test/e2e/fixtures/jiraServer.ts': [
        [2, 26],
        [38, 44],
      ],
      'test/e2e/smoke.spec.ts': [
        [1, 14],
        [17, 24],
        [46, 105],
        [141, 163],
      ],
      'tsconfig.node.json': [[18, 24]],
      'src/main/github/new.ts': [[1, 1]],
      'e2e/old.ts': [],
    });
  });

  test('joins the files from every page', async () => {
    // given
    const pages = JSON.stringify([
      [{ filename: 'a.ts', patch: '@@ -1 +1 @@\n-a\n+b' }],
      [{ filename: 'b.ts', patch: '@@ -3,2 +3,4 @@\n x\n+y\n+z\n w' }],
    ]);
    const run = vi.fn<Runner>(() => Promise.resolve(ok(pages)));
    // when
    const result = await diffLines(run, '/wt', 53);
    // then
    expect(result).toEqual({ 'a.ts': [[1, 1]], 'b.ts': [[3, 6]] });
  });

  test('rejects with the gh error', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'offline' }));
    // when
    const result = diffLines(run, '/wt', 53);
    // then
    await expect(result).rejects.toThrow('listing PR files: offline');
  });
});

describe('headCommit', () => {
  test('returns the PR head commit', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok('abc123\n')));
    // when
    const head = await headCommit(run, '/wt', 33);
    // then
    expect(head).toBe('abc123');
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'view', '33', '--json', 'headRefOid', '--jq', '.headRefOid'], '/wt');
  });

  test('rejects with the gh error', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'no pull requests found' }));
    // when
    const result = headCommit(run, '/wt', 33);
    // then
    await expect(result).rejects.toThrow('reading PR head: no pull requests found');
  });
});

describe('approveAndMerge', () => {
  const sha = 'a'.repeat(40);
  const viewPin = 'pr view 33 --json headRefOid,headRefName,baseRefName';
  const viewRepo = 'api repos/{owner}/{repo} --jq .default_branch';
  const review = `api --method POST repos/{owner}/{repo}/pulls/33/reviews -f event=APPROVE -f commit_id=${sha}`;
  const merge = `pr merge 33 --squash --match-head-commit ${sha}`;
  const pin = (head = sha, branch = 'dig-44-trail-map', target = 'main') =>
    ok(JSON.stringify({ headRefOid: head, headRefName: branch, baseRefName: target }));

  function runner(answers: Record<string, Reply>) {
    return vi.fn<Runner>((_cmd, args) => Promise.resolve(answers[args.join(' ')] ?? ok('')));
  }

  test.each([
    { name: 'a branch named after the card', branch: 'dig-44-trail-map' },
    { name: 'a branch that is the card key', branch: 'DIG-44' },
  ])('reviews and merges the pinned commit on $name', async ({ branch }) => {
    // given
    const run = runner({ [viewPin]: pin(sha, branch), [viewRepo]: ok('main\n') });
    // when
    await approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    expect(run.mock.calls.map(([, args]) => args.join(' '))).toEqual([viewPin, viewRepo, review, merge]);
  });

  test('merges a PR that targets the default branch GitHub reports', async () => {
    // given
    const run = runner({ [viewPin]: pin(sha, 'dig-44-trail-map', 'trunk'), [viewRepo]: ok('trunk\n') });
    // when
    await approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    expect(run).toHaveBeenCalledWith('gh', merge.split(' '), '');
  });

  test('merges the pinned commit without a review when GitHub refuses self-approval', async () => {
    // given
    const run = runner({
      [viewPin]: pin(),
      [viewRepo]: ok('main\n'),
      [review]: {
        code: 1,
        stdout: '{"message":"Unprocessable Entity","errors":["Can not approve your own pull request"]}',
        stderr: 'gh: Unprocessable Entity (HTTP 422)',
      },
    });
    // when
    await approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    expect(run).toHaveBeenCalledWith('gh', merge.split(' '), '');
  });

  test.each([
    {
      name: 'the head moved',
      reply: pin('d'.repeat(40)),
      want: 'the PR changed after the diff loaded; review it again',
    },
    { name: 'the PR targets another branch', reply: pin(sha, 'dig-44-x', 'dev'), want: 'PR targets dev, not main' },
    {
      name: 'the branch belongs to another card',
      reply: pin(sha, 'dig-440-trail'),
      want: 'branch dig-440-trail is not for DIG-44',
    },
  ])('refuses to merge when $name', async ({ reply, want }) => {
    // given
    const run = runner({ [viewPin]: reply, [viewRepo]: ok('main\n') });
    // when
    const result = approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    await expect(result).rejects.toThrow(`approving PR: ${want}`);
    expect(run.mock.calls.map(([, args]) => args.join(' '))).toEqual([viewPin, viewRepo]);
  });

  test.each([
    { name: 'head', failing: viewPin, want: 'reading PR head: offline' },
    { name: 'default branch', failing: viewRepo, want: 'reading default branch: offline' },
  ])('reports a failed $name read', async ({ failing, want }) => {
    // given
    const run = runner({
      [viewPin]: pin(),
      [viewRepo]: ok('main\n'),
      [failing]: { code: 1, stdout: '', stderr: 'offline' },
    });
    // when
    const result = approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    await expect(result).rejects.toThrow(new RegExp(`^approving PR: ${want}$`));
    expect(run).not.toHaveBeenCalledWith('gh', merge.split(' '), '');
  });
});
