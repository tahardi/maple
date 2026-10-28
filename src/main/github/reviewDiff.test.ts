import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { Runner as CommandRunner } from '@main/app/preflight';
import { MAX_BYTES } from '@main/app/paths';
import { reviewFilePair, reviewFiles } from './reviewDiff';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Reply = { code: number; stdout: string; stderr: string };

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const mergeBase = 'c'.repeat(40);
const raw = 'Accept: application/vnd.github.raw';

function fakeRunner(answers: Record<string, Reply | Reply[]>) {
  const seen = new Map<string, number>();
  return vi.fn<CommandRunner>((_cmd, args) => {
    const key = args.join(' ');
    const answer = answers[key] ?? { code: 1, stdout: '', stderr: `unexpected ${key}` };
    if (!Array.isArray(answer)) {
      return Promise.resolve(answer);
    }
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return Promise.resolve(answer[Math.min(n, answer.length - 1)] ?? ok(''));
  });
}

function reviewAnswers(views: Reply[]): Record<string, Reply | Reply[]> {
  return {
    'pr view 33 --json headRefOid,baseRefOid': views,
    [`api repos/{owner}/{repo}/compare/${base}...${head} --jq .merge_base_commit.sha`]: ok(`${mergeBase}\n`),
    'api --paginate --slurp repos/{owner}/{repo}/pulls/33/files': ok(fixture('pr-files.json')),
  };
}

const contents = (path: string, ref: string) => `api -H ${raw} repos/{owner}/{repo}/contents/${path}?ref=${ref}`;

describe('reviewFiles', () => {
  test('reviewFiles returns head, merge base, and files', async () => {
    // given
    const run = fakeRunner(reviewAnswers([ok(fixture('pr-view-head.json'))]));
    // when
    const review = await reviewFiles(run, 33);
    // then
    expect(review).toEqual({
      number: 33,
      headSha: head,
      baseSha: mergeBase,
      files: [
        {
          path: '.github/workflows/ci.yml',
          status: 'M',
          oldPath: null,
          stamp: '555c9ba3c56f59384b4c060b68b28e87643b8c84',
        },
        { path: 'README.md', status: 'M', oldPath: null, stamp: '369dbab65ec9286c2f1285f92f659e62858ede8e' },
        { path: 'playwright.config.ts', status: 'M', oldPath: null, stamp: '3b1497c81a9b7734b6560792b9ca2477ecb3719a' },
        {
          path: 'test/e2e/fixtures/bin/claude',
          status: 'R',
          oldPath: 'e2e/fixtures/bin/claude',
          stamp: 'b3115afe6c42696cc1c1e98cb844f395e3fcd05f',
        },
        {
          path: 'test/e2e/fixtures/config/config.json',
          status: 'R',
          oldPath: 'e2e/fixtures/config/config.json',
          stamp: 'fa9f1f73f7ce85de4856dbc940b5a02df991e782',
        },
        {
          path: 'test/e2e/fixtures/jira.env',
          status: 'R',
          oldPath: 'e2e/fixtures/jira.env',
          stamp: '48ae4dea70fe058549dc523dffc52ca77f2f0ef9',
        },
        {
          path: 'test/e2e/fixtures/jiraServer.ts',
          status: 'R',
          oldPath: 'e2e/fixtures/jiraServer.ts',
          stamp: '4eeae1d8e5098351bfc8b56ff18765e8dbec6ad6',
        },
        {
          path: 'test/e2e/smoke.spec.ts',
          status: 'R',
          oldPath: 'e2e/smoke.spec.ts',
          stamp: '83673f1bd4b3a3023d21b0f5a1d13fb282bd3ce9',
        },
        { path: 'tsconfig.node.json', status: 'M', oldPath: null, stamp: '4dbda29239de83be276c8eaad2e30368b18ec77e' },
        {
          path: 'src/main/github/new.ts',
          status: 'A',
          oldPath: null,
          stamp: '9f1c2b7e0d4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c',
        },
        { path: 'e2e/old.ts', status: 'D', oldPath: null, stamp: null },
      ],
    });
    expect(run).toHaveBeenCalledWith('gh', ['pr', 'view', '33', '--json', 'headRefOid,baseRefOid'], '');
  });

  test('reviewFiles throws when the head moves during the fetch', async () => {
    // given
    const moved = JSON.stringify({ headRefOid: 'd'.repeat(40), baseRefOid: base });
    const run = fakeRunner(reviewAnswers([ok(fixture('pr-view-head.json')), ok(moved)]));
    // when
    const result = reviewFiles(run, 33);
    // then
    await expect(result).rejects.toThrow('fetching review: the PR head moved, try again');
  });

  test.each([
    {
      name: 'copied as M',
      file: { filename: 'b.ts', status: 'copied', sha: 'f'.repeat(40) },
      status: 'M',
      oldPath: null,
    },
    {
      name: 'a rename without a previous name',
      file: { filename: 'b.ts', status: 'renamed', sha: 'f'.repeat(40) },
      status: 'R',
      oldPath: null,
    },
  ])('reviewFiles maps $name', async ({ file, status, oldPath }) => {
    // given
    const run = fakeRunner({
      ...reviewAnswers([ok(fixture('pr-view-head.json'))]),
      'api --paginate --slurp repos/{owner}/{repo}/pulls/33/files': ok(JSON.stringify([[file]])),
    });
    // when
    const review = await reviewFiles(run, 33);
    // then
    expect(review.files).toEqual([{ path: 'b.ts', status, oldPath, stamp: 'f'.repeat(40) }]);
  });

  test('reviewFiles reports a failed gh call', async () => {
    // given
    const run = fakeRunner(reviewAnswers([{ code: 1, stdout: '', stderr: 'HTTP 502' }]));
    // when
    const result = reviewFiles(run, 33);
    // then
    await expect(result).rejects.toThrow('fetching review: HTTP 502');
  });
});

describe('reviewFilePair', () => {
  test('reviewFilePair reads both sides at the pinned commits', async () => {
    // given
    const run = fakeRunner({
      [contents('src/a.ts', mergeBase)]: ok('old\n'),
      [contents('src/a.ts', head)]: ok('new\n'),
    });
    // when
    const pair = await reviewFilePair(run, 'src/a.ts', null, mergeBase, head);
    // then
    expect(pair).toEqual({ kind: 'text', path: 'src/a.ts', base: 'old\n', current: 'new\n' });
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '-H', raw, `repos/{owner}/{repo}/contents/src/a.ts?ref=${head}`],
      '',
    );
  });

  test('reviewFilePair reads the base side at the old path and encodes each segment', async () => {
    // given
    const run = fakeRunner({
      [contents('old%20dir/a%23b.ts', mergeBase)]: ok('old\n'),
      [contents('new%20dir/a%23b.ts', head)]: ok('new\n'),
    });
    // when
    const pair = await reviewFilePair(run, 'new dir/a#b.ts', 'old dir/a#b.ts', mergeBase, head);
    // then
    expect(pair).toEqual({ kind: 'text', path: 'new dir/a#b.ts', base: 'old\n', current: 'new\n' });
  });

  test('reviewFilePair returns null for a side GitHub does not have', async () => {
    // given
    const run = fakeRunner({
      [contents('src/a.ts', mergeBase)]: { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' },
      [contents('src/a.ts', head)]: ok('new\n'),
    });
    // when
    const pair = await reviewFilePair(run, 'src/a.ts', null, mergeBase, head);
    // then
    expect(pair).toEqual({ kind: 'text', path: 'src/a.ts', base: null, current: 'new\n' });
  });

  test('reviewFilePair reports a failed gh call', async () => {
    // given
    const run = fakeRunner({
      [contents('src/a.ts', mergeBase)]: ok('old\n'),
      [contents('src/a.ts', head)]: { code: 1, stdout: '', stderr: 'HTTP 502' },
    });
    // when
    const result = reviewFilePair(run, 'src/a.ts', null, mergeBase, head);
    // then
    await expect(result).rejects.toThrow('fetching review: HTTP 502');
  });

  test.each([
    { name: 'binary', current: 'a\0b', want: { kind: 'binary', path: 'src/a.ts' } },
    {
      name: 'too-large',
      current: 'a'.repeat(MAX_BYTES + 1),
      want: { kind: 'tooLarge', path: 'src/a.ts', bytes: MAX_BYTES + 1 },
    },
  ])('reviewFilePair marks $name content', async ({ current, want }) => {
    // given
    const run = fakeRunner({
      [contents('src/a.ts', mergeBase)]: ok('old\n'),
      [contents('src/a.ts', head)]: ok(current),
    });
    // when
    const pair = await reviewFilePair(run, 'src/a.ts', null, mergeBase, head);
    // then
    expect(pair).toEqual(want);
  });

  test('reviewFilePair keeps text of exactly MAX_BYTES and a deleted side as null', async () => {
    // given
    const run = fakeRunner({
      [contents('src/a.ts', mergeBase)]: ok('a'.repeat(MAX_BYTES)),
      [contents('src/a.ts', head)]: { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' },
    });
    // when
    const pair = await reviewFilePair(run, 'src/a.ts', null, mergeBase, head);
    // then
    expect(pair).toEqual({ kind: 'text', path: 'src/a.ts', base: 'a'.repeat(MAX_BYTES), current: null });
  });

  test.each([
    { name: 'a parent segment', path: '../secrets', oldPath: null },
    { name: 'a dot segment', path: 'src/./a.ts', oldPath: null },
    { name: 'an empty segment', path: 'src//a.ts', oldPath: null },
    { name: 'a leading slash', path: '/a.ts', oldPath: null },
    { name: 'a bad old path', path: 'src/a.ts', oldPath: 'src/../../x' },
  ])('reviewFilePair rejects $name', async ({ path, oldPath }) => {
    // given
    const run = fakeRunner({});
    // when
    const result = reviewFilePair(run, path, oldPath, mergeBase, head);
    // then
    await expect(result).rejects.toThrow('reading review file: invalid path');
    expect(run).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'base', baseSha: 'main', headSha: head },
    { name: 'head', baseSha: mergeBase, headSha: 'A'.repeat(40) },
  ])('reviewFilePair rejects a $name sha that is not 40 hex characters', async ({ baseSha, headSha }) => {
    // given
    const run = fakeRunner({});
    // when
    const result = reviewFilePair(run, 'src/a.ts', null, baseSha, headSha);
    // then
    await expect(result).rejects.toThrow('reading review file: invalid commit');
    expect(run).not.toHaveBeenCalled();
  });
});
