import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { approveAndMerge, diffLines } from './pr';
import type { Runner } from '@main/app/preflight';
import { MERGE_TIMEOUT_MS } from '@main/util/commandTimeout';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Reply = { code: number; stdout: string; stderr: string };

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });

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
    expect(run).toHaveBeenCalledWith('gh', merge.split(' '), '', MERGE_TIMEOUT_MS);
  });

  test('gives only the merge the longer timeout', async () => {
    // given
    const run = runner({ [viewPin]: pin(), [viewRepo]: ok('main\n') });
    // when
    await approveAndMerge(run, 33, sha, 'DIG-44');
    // then
    const others = run.mock.calls.filter(([, args]) => args.join(' ') !== merge);
    expect(others.map((call) => call.length)).toEqual([3, 3, 3]);
    expect(others.every((call) => call[3] === undefined)).toBe(true);
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
    expect(run).toHaveBeenCalledWith('gh', merge.split(' '), '', MERGE_TIMEOUT_MS);
  });

  test.each([
    {
      name: 'the head moved',
      reply: pin('d'.repeat(40)),
      want: 'the PR has new commits since the review loaded; Approve again once the review updates',
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
    expect(run).not.toHaveBeenCalledWith('gh', merge.split(' '), '', MERGE_TIMEOUT_MS);
  });
});
