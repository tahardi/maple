import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { Runner } from '@main/app/preflight';
import { batchKey, batchQueries, checkRun, fetchPrs, parsePrBatch, type RepoBranch } from './prBatch';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

const jobs = 'https://github.com/tahardi/maple/actions/runs/43013496447/job';

const recorded: RepoBranch[] = [
  { repo: 'tahardi/maple', branch: 'mpl-217-worktree-pr-repo' },
  { repo: 'tahardi/no-such-repo', branch: 'x' },
  { repo: 'tahardi/maple', branch: 'no-such-branch' },
];

function node(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    url: 'https://github.com/tahardi/maple/pull/7',
    title: 'Seven',
    state: 'OPEN',
    body: '## Deviations from the card\n\nNone\n',
    isCrossRepository: false,
    mergeable: 'MERGEABLE',
    headRefName: 'mpl-7-seven',
    headRefOid: 'b'.repeat(40),
    statusCheckRollup: null,
    ...overrides,
  };
}

function response(aliases: Record<string, unknown>, errors: unknown[] = []): string {
  return JSON.stringify({ data: aliases, ...(errors.length > 0 ? { errors } : {}) });
}

const one: RepoBranch[] = [{ repo: 'tahardi/maple', branch: 'mpl-7-seven' }];

describe('batchQueries', () => {
  test('writes one alias per repo and branch pair', () => {
    // given
    const pairs: RepoBranch[] = [
      { repo: 'tahardi/maple', branch: 'mpl-1-a' },
      { repo: 'tahardi/xena', branch: 'xena-2-b' },
    ];
    // when
    const queries = batchQueries(pairs);
    // then
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('p0: repository(owner: "tahardi", name: "maple")');
    expect(queries[0]).toContain('pullRequests(headRefName: "mpl-1-a", first: 5');
    expect(queries[0]).toContain('p1: repository(owner: "tahardi", name: "xena")');
    expect(queries[0]).toContain('pullRequests(headRefName: "xena-2-b", first: 5');
    expect(queries[0]).toContain(' mergeable ');
  });

  test('escapes values as JSON strings', () => {
    // given
    const pairs: RepoBranch[] = [{ repo: 'tahardi/maple', branch: 'a"b\\c' }];
    // when
    const [query] = batchQueries(pairs);
    // then
    expect(query).toContain('headRefName: "a\\"b\\\\c"');
  });

  test('splits more than 100 pairs into several queries', () => {
    // given
    const pairs = Array.from({ length: 201 }, (_, i) => ({ repo: 'tahardi/maple', branch: `b-${String(i)}` }));
    // when
    const queries = batchQueries(pairs);
    // then
    expect(queries).toHaveLength(3);
    expect(queries[1]).toContain('p99: repository');
    expect(queries[1]).not.toContain('p100: repository');
    expect(queries[2]).toContain('p0: repository(owner: "tahardi", name: "maple") { pullRequests(headRefName: "b-200"');
  });
});

describe('parsePrBatch', () => {
  test('maps a recorded response to PRs keyed by repo and branch', () => {
    // given
    const stdout = fixture('pr-batch.json');
    // when
    const result = parsePrBatch(recorded, stdout);
    // then
    const prs = result.get(batchKey(recorded[0]));
    expect(prs).toEqual([
      expect.objectContaining({
        number: 141,
        url: 'https://github.com/tahardi/maple/pull/141',
        state: 'MERGED',
        checks: {
          passed: 5,
          failed: 0,
          pending: 0,
          total: 5,
          runs: [
            { name: 'format', bucket: 'pass', link: `${jobs}/130498685528` },
            { name: 'lint', bucket: 'pass', link: `${jobs}/130498685520` },
            { name: 'typecheck', bucket: 'pass', link: `${jobs}/130498685436` },
            { name: 'unit-test', bucket: 'pass', link: `${jobs}/130498685188` },
            { name: 'e2e', bucket: 'pass', link: `${jobs}/130498685424` },
          ],
        },
      }),
    ]);
  });

  test('reads whether each PR can merge', () => {
    // given
    const stdout = fixture('pr-batch.json');
    // when
    const result = parsePrBatch(recorded, stdout);
    // then
    expect(result.get(batchKey(recorded[0]))).toEqual([expect.objectContaining({ mergeable: 'CONFLICTING' })]);
  });

  test('gives a pair with no PR an empty list', () => {
    // given
    const stdout = fixture('pr-batch.json');
    // when
    const result = parsePrBatch(recorded, stdout);
    // then
    expect(result.get(batchKey(recorded[2]))).toEqual([]);
  });

  test('gives a failed alias its error while the others keep their data', () => {
    // given
    const stdout = fixture('pr-batch.json');
    // when
    const result = parsePrBatch(recorded, stdout);
    // then
    const failed = result.get(batchKey(recorded[1]));
    expect(failed).toBeInstanceOf(Error);
    expect(failed).toHaveProperty(
      'message',
      "listing PRs in tahardi/no-such-repo: Could not resolve to a Repository with the name 'tahardi/no-such-repo'.",
    );
    expect(result.get(batchKey(recorded[0]))).toHaveLength(1);
  });

  test('builds the PR with parsed body sections and head commit', () => {
    // given
    const stdout = response({ p0: { pullRequests: { nodes: [node()] } } });
    // when
    const result = parsePrBatch(one, stdout);
    // then
    expect(result.get(batchKey(one[0]))).toEqual([
      {
        number: 7,
        url: 'https://github.com/tahardi/maple/pull/7',
        title: 'Seven',
        state: 'OPEN',
        body: '## Deviations from the card\n\nNone\n',
        deviations: 'None',
        needsTaylor: null,
        cardImpacts: null,
        headSha: 'b'.repeat(40),
        mergeable: 'MERGEABLE',
        checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] },
      },
    ]);
  });

  test('drops PRs from forks', () => {
    // given
    const fork = node({ number: 8, isCrossRepository: true });
    const stdout = response({ p0: { pullRequests: { nodes: [fork, node()] } } });
    // when
    const result = parsePrBatch(one, stdout);
    // then
    expect(result.get(batchKey(one[0]))).toEqual([expect.objectContaining({ number: 7 })]);
  });

  test('keeps only the newest run of a check that was re-run', () => {
    // given
    const contexts = [
      {
        __typename: 'CheckRun',
        name: 'lint',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
        detailsUrl: 'old',
        startedAt: '2026-11-11T10:00:00Z',
      },
      {
        __typename: 'CheckRun',
        name: 'lint',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: 'new',
        startedAt: '2026-11-11T11:00:00Z',
      },
    ];
    const rollup = { contexts: { nodes: contexts } };
    const stdout = response({ p0: { pullRequests: { nodes: [node({ statusCheckRollup: rollup })] } } });
    // when
    const result = parsePrBatch(one, stdout);
    // then
    expect(result.get(batchKey(one[0]))).toEqual([
      expect.objectContaining({
        checks: { passed: 1, failed: 0, pending: 0, total: 1, runs: [{ name: 'lint', bucket: 'pass', link: 'new' }] },
      }),
    ]);
  });

  test('keeps a check run and a status context that share a name', () => {
    // given
    const contexts = [
      {
        __typename: 'CheckRun',
        name: 'ci',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: 'a',
        startedAt: null,
      },
      { __typename: 'StatusContext', context: 'ci', state: 'FAILURE', targetUrl: 'b' },
    ];
    const rollup = { contexts: { nodes: contexts } };
    const stdout = response({ p0: { pullRequests: { nodes: [node({ statusCheckRollup: rollup })] } } });
    // when
    const result = parsePrBatch(one, stdout);
    // then
    expect(result.get(batchKey(one[0]))).toEqual([
      expect.objectContaining({ checks: expect.objectContaining({ passed: 1, failed: 1, total: 2 }) as unknown }),
    ]);
  });

  test('counts check buckets the way gh pr checks does', () => {
    // given
    const contexts = [
      {
        __typename: 'CheckRun',
        name: 'a',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: 'u',
        startedAt: null,
      },
      {
        __typename: 'CheckRun',
        name: 'b',
        status: 'COMPLETED',
        conclusion: 'SKIPPED',
        detailsUrl: 'u',
        startedAt: null,
      },
      {
        __typename: 'CheckRun',
        name: 'c',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
        detailsUrl: 'u',
        startedAt: null,
      },
      {
        __typename: 'CheckRun',
        name: 'd',
        status: 'COMPLETED',
        conclusion: 'CANCELLED',
        detailsUrl: 'u',
        startedAt: null,
      },
      { __typename: 'CheckRun', name: 'e', status: 'IN_PROGRESS', conclusion: null, detailsUrl: 'u', startedAt: null },
    ];
    const rollup = { contexts: { nodes: contexts } };
    const stdout = response({ p0: { pullRequests: { nodes: [node({ statusCheckRollup: rollup })] } } });
    // when
    const result = parsePrBatch(one, stdout);
    // then
    expect(result.get(batchKey(one[0]))).toEqual([
      expect.objectContaining({
        checks: expect.objectContaining({ passed: 2, failed: 2, pending: 1, total: 5 }) as unknown,
      }),
    ]);
  });

  test('gives every pair the error when the response has no data', () => {
    // given
    const stdout = JSON.stringify({ errors: [{ message: 'Something went wrong' }] });
    // when
    const result = parsePrBatch(one, stdout);
    // then
    expect(result.get(batchKey(one[0]))).toHaveProperty('message', 'listing PRs: Something went wrong');
  });
});

describe('checkRun', () => {
  test.each([
    { status: 'COMPLETED', conclusion: 'SUCCESS', bucket: 'pass' },
    { status: 'COMPLETED', conclusion: 'NEUTRAL', bucket: 'skipping' },
    { status: 'COMPLETED', conclusion: 'SKIPPED', bucket: 'skipping' },
    { status: 'COMPLETED', conclusion: 'CANCELLED', bucket: 'cancel' },
    { status: 'COMPLETED', conclusion: 'FAILURE', bucket: 'fail' },
    { status: 'COMPLETED', conclusion: 'TIMED_OUT', bucket: 'fail' },
    { status: 'COMPLETED', conclusion: 'ACTION_REQUIRED', bucket: 'fail' },
    { status: 'COMPLETED', conclusion: 'STARTUP_FAILURE', bucket: 'fail' },
    { status: 'COMPLETED', conclusion: 'STALE', bucket: 'fail' },
    { status: 'IN_PROGRESS', conclusion: null, bucket: 'pending' },
    { status: 'QUEUED', conclusion: null, bucket: 'pending' },
  ])('maps a $status $conclusion check run to $bucket', ({ status, conclusion, bucket }) => {
    // given
    const run = {
      __typename: 'CheckRun' as const,
      name: 'ci',
      status,
      conclusion,
      detailsUrl: 'https://ci/1',
      startedAt: null,
    };
    // when
    const result = checkRun(run);
    // then
    expect(result).toEqual({ name: 'ci', bucket, link: 'https://ci/1' });
  });

  test.each([
    { state: 'SUCCESS', bucket: 'pass' },
    { state: 'PENDING', bucket: 'pending' },
    { state: 'EXPECTED', bucket: 'pending' },
    { state: 'ERROR', bucket: 'fail' },
    { state: 'FAILURE', bucket: 'fail' },
  ])('maps a $state status context to $bucket', ({ state, bucket }) => {
    // given
    const context = { __typename: 'StatusContext' as const, context: 'ci/x', state, targetUrl: 'https://ci/2' };
    // when
    const result = checkRun(context);
    // then
    expect(result).toEqual({ name: 'ci/x', bucket, link: 'https://ci/2' });
  });

  test('uses an empty link when the check has none', () => {
    // given
    const run = {
      __typename: 'CheckRun' as const,
      name: 'ci',
      status: 'QUEUED',
      conclusion: null,
      detailsUrl: null,
      startedAt: null,
    };
    // when
    const result = checkRun(run);
    // then
    expect(result.link).toBe('');
  });
});

describe('fetchPrs', () => {
  test('runs one gh api graphql call per query', async () => {
    // given
    const run = vi.fn<Runner>(() =>
      Promise.resolve({ code: 0, stdout: response({ p0: { pullRequests: { nodes: [] } } }), stderr: '' }),
    );
    // when
    await fetchPrs(run, one);
    // then
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('gh', ['api', 'graphql', '-f', `query=${batchQueries(one)[0]}`]);
  });

  test('reads the data gh prints even when one alias fails', async () => {
    // given
    const run = vi.fn<Runner>(() =>
      Promise.resolve({ code: 1, stdout: fixture('pr-batch.json'), stderr: 'gh: Could not resolve' }),
    );
    // when
    const result = await fetchPrs(run, recorded);
    // then
    expect(result.get(batchKey(recorded[0]))).toHaveLength(1);
    expect(result.get(batchKey(recorded[1]))).toBeInstanceOf(Error);
  });

  test('gives every pair the error when gh prints no data', async () => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'gh: offline' }));
    // when
    const result = await fetchPrs(run, one);
    // then
    expect(result.get(batchKey(one[0]))).toHaveProperty('message', 'listing PRs: gh: offline');
  });

  test('runs one call per query and keys every result by its own pair', async () => {
    // given
    const pairs = Array.from({ length: 101 }, (_, i) => ({ repo: 'tahardi/maple', branch: `b-${String(i)}` }));
    const run = vi.fn<Runner>((_cmd, args) => {
      const branches = [...(args[3] ?? '').matchAll(/p(\d+): repository.*?headRefName: "([^"]*)"/g)];
      const data = Object.fromEntries(
        branches.map(([, index, branch]) => [
          `p${index}`,
          { pullRequests: { nodes: [node({ number: Number(branch.slice(2)) + 1000 })] } },
        ]),
      );
      return Promise.resolve({ code: 0, stdout: JSON.stringify({ data }), stderr: '' });
    });
    // when
    const result = await fetchPrs(run, pairs);
    // then
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(101);
    expect(result.get(batchKey(pairs[0]))).toEqual([expect.objectContaining({ number: 1000 })]);
    expect(result.get(batchKey(pairs[100]))).toEqual([expect.objectContaining({ number: 1100 })]);
  });

  test.each([
    { name: 'is not JSON', stdout: 'oops' },
    { name: 'has the wrong shape', stdout: JSON.stringify({ data: { p0: { pullRequests: 'x' } } }) },
  ])('gives every pair a listing error when gh exits cleanly but its output $name', async ({ stdout }) => {
    // given
    const run = vi.fn<Runner>(() => Promise.resolve({ code: 0, stdout, stderr: '' }));
    // when
    const result = await fetchPrs(run, one);
    // then
    expect(result.get(batchKey(one[0]))).toHaveProperty('message', expect.stringMatching(/^listing PRs: /) as unknown);
  });

  test('runs no gh call for no pairs', async () => {
    // given
    const run = vi.fn<Runner>();
    // when
    const result = await fetchPrs(run, []);
    // then
    expect(result.size).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});
