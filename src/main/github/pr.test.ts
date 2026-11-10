import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { approveAndMerge, diffLines, prForBranch } from './pr';
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
      headSha: '0123456789abcdef0123456789abcdef01234567',
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
        '100',
        '--json',
        'number,url,title,state,body,headRefOid,isCrossRepository',
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

  test('returns the same-repo PR when a newer fork PR is listed first', async () => {
    // given
    const run = fakeRunner(ok(fixture('pr-list-fork-first.json')), ok('[]'));
    // when
    const pr = await prForBranch(run, '/wt', 'mpl-13-github-client');
    // then
    expect(pr?.number).toBe(33);
    expect(pr?.url).toBe('https://github.com/tahardi/maple/pull/33');
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'checks', '33', '--json', 'name,bucket,link'], '/wt');
    expect(run).not.toHaveBeenCalledWith('gh', ['pr', 'checks', '41', '--json', 'name,bucket,link'], '/wt');
  });

  test('returns the newest same-repo PR when several are listed behind a fork PR', async () => {
    // given
    const row = (number: number, isCrossRepository: boolean) => ({
      number,
      url: `https://github.com/tahardi/maple/pull/${String(number)}`,
      title: '[MPL-13] GitHub Client',
      state: 'OPEN',
      body: '',
      headRefOid: 'a'.repeat(40),
      isCrossRepository,
    });
    const run = fakeRunner(ok(JSON.stringify([row(41, true), row(35, false), row(33, false)])), ok('[]'));
    // when
    const pr = await prForBranch(run, '/wt', 'mpl-13-github-client');
    // then
    expect(pr?.number).toBe(35);
  });

  test('rejects a listed PR that does not say whether it comes from a fork', async () => {
    // given
    const listed = [
      { number: 33, url: 'https://github.com/tahardi/maple/pull/33', title: 't', state: 'OPEN', body: '' },
    ];
    const run = fakeRunner(ok(JSON.stringify(listed)), ok('[]'));
    // when
    const result = prForBranch(run, '/wt', 'mpl-13-github-client');
    // then
    await expect(result).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('returns null when only a fork PR exists', async () => {
    // given
    const run = fakeRunner(ok(fixture('pr-list-fork-only.json')), ok('[]'));
    // when
    const pr = await prForBranch(run, '/wt', 'mpl-13-github-client');
    // then
    expect(pr).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
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
  const base = 'b'.repeat(40);
  const head = 'a'.repeat(40);

  test('maps each file to the new-side ranges of its hunks', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve(ok(fixture('compare-files.json'))));
    // when
    const result = await diffLines(run, '/wt', base, head);
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', `repos/{owner}/{repo}/compare/${base}...${head}`, '--jq', '.files'],
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

  test('rejects with the gh error', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'offline' }));
    // when
    const result = diffLines(run, '/wt', base, head);
    // then
    await expect(result).rejects.toThrow('listing PR files: offline');
  });
});

describe('approveAndMerge', () => {
  const sha = 'a'.repeat(40);
  const viewPin = 'pr view 33 --json headRefOid,headRefName,baseRefName,isCrossRepository';
  const viewRepo = 'api repos/{owner}/{repo} --jq .default_branch';
  const review = `api --method POST repos/{owner}/{repo}/pulls/33/reviews -f event=APPROVE -f commit_id=${sha}`;
  const merge = `pr merge 33 --squash --match-head-commit ${sha}`;
  const pin = (head = sha, branch = 'dig-44-trail-map', target = 'main', isCrossRepository = false) =>
    ok(JSON.stringify({ headRefOid: head, headRefName: branch, baseRefName: target, isCrossRepository }));

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
      want: 'the PR has new commits since the review loaded; click Reload review',
    },
    { name: 'the PR targets another branch', reply: pin(sha, 'dig-44-x', 'dev'), want: 'PR targets dev, not main' },
    {
      name: 'the branch belongs to another card',
      reply: pin(sha, 'dig-440-trail'),
      want: 'branch dig-440-trail is not for DIG-44',
    },
    {
      name: 'the PR comes from a fork',
      reply: pin(sha, 'dig-44-trail-map', 'main', true),
      want: 'PR comes from a fork',
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

  test('refuses to merge when the PR does not say whether it comes from a fork', async () => {
    // given
    const reply = ok(JSON.stringify({ headRefOid: sha, headRefName: 'dig-44-trail-map', baseRefName: 'main' }));
    const run = runner({ [viewPin]: reply, [viewRepo]: ok('main\n') });
    // when
    const result = approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    await expect(result).rejects.toThrow();
    expect(run.mock.calls.map(([, args]) => args.join(' '))).toEqual([viewPin]);
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
