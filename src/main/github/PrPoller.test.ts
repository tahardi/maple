import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config';
import type { TabState } from '@shared/types/tabs';
import type { Runner } from '@main/app/preflight';
import { POLL_MS, PrPoller } from './PrPoller';

type Pr = { number: number; state: 'OPEN' | 'MERGED' | 'CLOSED' };

const ALIAS = /p(\d+): repository\(owner: "([^"]*)", name: "([^"]*)"\) \{ pullRequests\(headRefName: "([^"]*)"/g;

function node(repo: string, pr: Pr) {
  return {
    number: pr.number,
    url: `https://github.com/${repo}/pull/${String(pr.number)}`,
    title: `PR ${String(pr.number)}`,
    state: pr.state,
    body: '',
    isCrossRepository: false,
    headRefName: 'x',
    headRefOid: 'a'.repeat(40),
    statusCheckRollup: null,
  };
}

function github(prs: Record<string, Pr[]>) {
  const queried: string[][] = [];
  const run = vi.fn<Runner>((_cmd, args) => {
    const data: Record<string, unknown> = {};
    const pairs: string[] = [];
    for (const [, index, owner, name, branch] of (args[3] ?? '').matchAll(ALIAS)) {
      const repo = `${owner}/${name}`;
      pairs.push(`${repo}@${branch}`);
      data[`p${index}`] = { pullRequests: { nodes: (prs[`${repo}@${branch}`] ?? []).map((pr) => node(repo, pr)) } };
    }
    queried.push(pairs);
    return Promise.resolve({ code: 0, stdout: JSON.stringify({ data }), stderr: '' });
  });
  return { run, queried };
}

const maple: ProjectConfig = {
  name: 'Maple',
  jiraKey: 'MPL',
  jiraBoardId: 1,
  plannerDir: '/tmp/maple',
  repo: 'tahardi/maple',
  otherRepos: [],
};

const xena: ProjectConfig = {
  name: 'Xena',
  jiraKey: 'XENA',
  jiraBoardId: 2,
  plannerDir: '/tmp/xena',
  repo: 'tahardi/xena',
  otherRepos: ['tahardi/dotclaude'],
};

function tab(id: string, paths: string[], overrides: Partial<TabState> = {}): TabState {
  return {
    id,
    projectKey: 'MPL',
    kind: 'card',
    cardKey: `MPL-${id}`,
    sessionId: `s-${id}`,
    worktreePath: paths[0] ?? null,
    worktreePaths: paths,
    ...overrides,
  };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function poller(tabs: () => TabState[], run: Runner, branch = (path: string) => Promise.resolve(`b${path}`)) {
  return new PrPoller({
    tabs,
    project: (key) => Promise.resolve({ MPL: maple, XENA: xena }[key] ?? null),
    branch,
    run,
    logger,
    now: () => new Date('2026-11-11T12:00:00Z'),
  });
}

describe('PrPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('runs one query per interval however many tabs are open', async () => {
    // given
    const tabs = [tab('1', ['/a']), tab('2', ['/b']), tab('3', ['/c']), tab('4', ['/d'])];
    const { run, queried } = github({});
    const stop = poller(() => tabs, run).start();
    // when
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    stop();
    // then
    expect(run).toHaveBeenCalledTimes(3);
    expect(queried[0]).toEqual(['tahardi/maple@b/a', 'tahardi/maple@b/b', 'tahardi/maple@b/c', 'tahardi/maple@b/d']);
  });

  test('stops polling once stopped', async () => {
    // given
    const { run } = github({});
    const stop = poller(() => [tab('1', ['/a'])], run).start();
    await vi.advanceTimersByTimeAsync(0);
    // when
    stop();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    // then
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('skips tabs with no worktree and tabs that are not cards', async () => {
    // given
    const branch = vi.fn((path: string) => Promise.resolve(`b${path}`));
    const tabs = [tab('1', []), tab('2', ['/p'], { kind: 'planner', cardKey: null }), tab('3', ['/c'])];
    const { run, queried } = github({});
    // when
    await poller(() => tabs, run, branch).poll();
    // then
    expect(queried).toEqual([['tahardi/maple@b/c']]);
    expect(branch).toHaveBeenCalledTimes(1);
  });

  test('runs no query when no tab has a worktree', async () => {
    // given
    const { run } = github({});
    // when
    await poller(() => [tab('1', [])], run).poll();
    // then
    expect(run).not.toHaveBeenCalled();
  });

  test('runs only one poll at a time', async () => {
    // given
    let finish: () => void = () => undefined;
    const run = vi.fn<Runner>(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve({ code: 0, stdout: JSON.stringify({ data: { p0: null } }), stderr: '' });
          };
        }),
    );
    const prs = poller(() => [tab('1', ['/a'])], run);
    const stop = prs.start();
    await vi.advanceTimersByTimeAsync(0);
    // when
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    // then
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    stop();
  });

  test('serves the latest PR for a tab worktree', async () => {
    // given
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => [tab('1', ['/a'])], run);
    await prs.poll();
    // when
    const result = await prs.latest('1', '/a');
    // then
    expect(result).toEqual({
      data: expect.objectContaining({ number: 5, url: 'https://github.com/tahardi/maple/pull/5' }) as unknown,
      error: null,
      fetchedAt: '2026-11-11T12:00:00.000Z',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('serves no PR when the branch has none', async () => {
    // given
    const { run } = github({});
    const prs = poller(() => [tab('1', ['/a'])], run);
    await prs.poll();
    // when
    const result = await prs.latest('1', '/a');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: '2026-11-11T12:00:00.000Z' });
  });

  test('polls every worktree of a tab and keys each by tab and worktree', async () => {
    // given
    const { run } = github({
      'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }],
      'tahardi/maple@b/b': [{ number: 6, state: 'OPEN' }],
    });
    const prs = poller(() => [tab('1', ['/a', '/b'])], run);
    await prs.poll();
    // when
    const [a, b, other] = await Promise.all([prs.latest('1', '/a'), prs.latest('1', '/b'), prs.latest('2', '/a')]);
    // then
    expect(a.data?.number).toBe(5);
    expect(b.data?.number).toBe(6);
    expect(other.data).toBeNull();
  });

  test('keeps the last good result and reports the error when a poll fails', async () => {
    // given
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => [tab('1', ['/a'])], run);
    await prs.poll();
    run.mockResolvedValue({ code: 1, stdout: '', stderr: 'gh: offline' });
    // when
    await prs.poll();
    const result = await prs.latest('1', '/a');
    // then
    expect(result).toEqual({
      data: expect.objectContaining({ number: 5 }) as unknown,
      error: 'listing PRs: gh: offline',
      fetchedAt: '2026-11-11T12:00:00.000Z',
    });
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:poll',
      tabId: '1',
      worktree: '/a',
      error: 'listing PRs: gh: offline',
    });
  });

  test('clears the error once a poll succeeds again', async () => {
    // given
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => [tab('1', ['/a'])], run);
    run.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'gh: offline' });
    await prs.poll();
    // when
    await prs.poll();
    const result = await prs.latest('1', '/a');
    // then
    expect(result.error).toBeNull();
    expect(result.data?.number).toBe(5);
  });

  test.each([
    {
      name: 'the branch lookup fails',
      tabs: [tab('1', ['/a'])],
      branch: () => Promise.reject(new Error('listing branch: git down')),
      want: 'listing branch: git down',
    },
    {
      name: 'the project is unknown',
      tabs: [tab('1', ['/a'], { projectKey: 'NOPE' })],
      branch: () => Promise.resolve('b'),
      want: 'finding project repo: unknown project NOPE',
    },
  ])('reports an error for the worktree when $name', async ({ tabs, branch, want }) => {
    // given
    const { run } = github({});
    const prs = poller(() => tabs, run, branch);
    await prs.poll();
    // when
    const result = await prs.latest('1', '/a');
    // then
    expect(result).toEqual({ data: null, error: want, fetchedAt: null });
  });

  test('polls a new tab without waiting for the next interval', async () => {
    // given
    const tabs: TabState[] = [];
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => tabs, run);
    const stop = prs.start();
    await vi.advanceTimersByTimeAsync(0);
    tabs.push(tab('1', ['/a']));
    // when
    const result = await prs.latest('1', '/a');
    stop();
    // then
    expect(result.data?.number).toBe(5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('shares one poll between several new tabs', async () => {
    // given
    const tabs = [tab('1', ['/a']), tab('2', ['/b']), tab('3', ['/c'])];
    const { run } = github({});
    const prs = poller(() => tabs, run);
    // when
    await Promise.all([prs.latest('1', '/a'), prs.latest('2', '/b'), prs.latest('3', '/c')]);
    // then
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('waits for a running poll instead of starting another for a new tab', async () => {
    // given
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => [tab('1', ['/a'])], run);
    const running = prs.poll();
    // when
    const result = await prs.latest('1', '/a');
    await running;
    // then
    expect(result.data?.number).toBe(5);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('serves nothing for a worktree no poll covers', async () => {
    // given
    const { run } = github({});
    const prs = poller(() => [], run);
    // when
    const result = await prs.latest('9', '/z');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
  });

  test('queries only the repo the worktree folder names', async () => {
    // given
    const { run, queried } = github({});
    const prs = poller(() => [tab('1', ['/wts/dotclaude-xena-1-x'], { projectKey: 'XENA' })], run);
    // when
    await prs.poll();
    // then
    expect(queried).toEqual([['tahardi/dotclaude@b/wts/dotclaude-xena-1-x']]);
  });

  test.each<{ name: string; found: Record<string, Pr[]>; want: string | null }>([
    {
      name: 'the first repo with an open PR',
      found: {
        'tahardi/xena@b/wts/x-1': [{ number: 1, state: 'MERGED' }],
        'tahardi/dotclaude@b/wts/x-1': [{ number: 2, state: 'OPEN' }],
      },
      want: 'https://github.com/tahardi/dotclaude/pull/2',
    },
    {
      name: 'the first repo with any PR when none is open',
      found: {
        'tahardi/xena@b/wts/x-1': [],
        'tahardi/dotclaude@b/wts/x-1': [{ number: 2, state: 'CLOSED' }],
      },
      want: 'https://github.com/tahardi/dotclaude/pull/2',
    },
    {
      name: 'the project repo before others when both have an open PR',
      found: {
        'tahardi/xena@b/wts/x-1': [{ number: 1, state: 'OPEN' }],
        'tahardi/dotclaude@b/wts/x-1': [{ number: 2, state: 'OPEN' }],
      },
      want: 'https://github.com/tahardi/xena/pull/1',
    },
    { name: 'no PR when no repo has one', found: {}, want: null },
  ])('picks $name when the worktree folder names no repo', async ({ found, want }) => {
    // given
    const { run, queried } = github(found);
    const prs = poller(() => [tab('1', ['/wts/x-1'], { projectKey: 'XENA' })], run);
    await prs.poll();
    // when
    const result = await prs.latest('1', '/wts/x-1');
    // then
    expect(result.data?.url ?? null).toBe(want);
    expect(queried).toEqual([['tahardi/xena@b/wts/x-1', 'tahardi/dotclaude@b/wts/x-1']]);
  });

  test('drops the result of a closed tab after the next poll', async () => {
    // given
    const tabs = [tab('1', ['/a'])];
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => tabs, run);
    await prs.poll();
    tabs.pop();
    await prs.poll();
    // when
    const result = await prs.latest('1', '/a');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
  });

  test('asks once for a repo and branch two tabs share', async () => {
    // given
    const { run, queried } = github({});
    const prs = poller(() => [tab('1', ['/a']), tab('2', ['/a'])], run);
    // when
    await prs.poll();
    // then
    expect(queried).toEqual([['tahardi/maple@b/a']]);
  });

  test('polls the selected worktree even when the worktree list misses it', async () => {
    // given
    const { run, queried } = github({});
    const prs = poller(() => [tab('1', ['/a'], { worktreePath: '/b' })], run);
    // when
    await prs.poll();
    // then
    expect(queried).toEqual([['tahardi/maple@b/a', 'tahardi/maple@b/b']]);
  });

  test('serves other tabs their PR when one tab fails', async () => {
    // given
    const branch = (path: string) =>
      path === '/bad' ? Promise.reject(new Error('listing branch: git down')) : Promise.resolve(`b${path}`);
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => [tab('1', ['/bad']), tab('2', ['/a'])], run, branch);
    await prs.poll();
    // when
    const [bad, good] = await Promise.all([prs.latest('1', '/bad'), prs.latest('2', '/a')]);
    // then
    expect(bad.error).toBe('listing branch: git down');
    expect(good).toEqual({
      data: expect.objectContaining({ number: 5 }) as unknown,
      error: null,
      fetchedAt: '2026-11-11T12:00:00.000Z',
    });
  });

  test('waits for a running poll before serving a known tab', async () => {
    // given
    const { run } = github({ 'tahardi/maple@b/a': [{ number: 5, state: 'OPEN' }] });
    const prs = poller(() => [tab('1', ['/a'])], run);
    run.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: { p0: null } }), stderr: '' });
    await prs.poll();
    prs.refresh();
    // when
    const result = await prs.latest('1', '/a');
    // then
    expect(result.data?.number).toBe(5);
  });

  test('polls right away on refresh', async () => {
    // given
    const { run } = github({});
    const prs = poller(() => [tab('1', ['/a'])], run);
    // when
    prs.refresh();
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(run).toHaveBeenCalledTimes(1);
  });

  test.each([
    { prev: 'working', dot: 'idle', polls: 1 },
    { prev: 'working', dot: 'ready', polls: 1 },
    { prev: 'working', dot: 'merged', polls: 1 },
    { prev: 'working', dot: 'waiting', polls: 1 },
    { prev: 'idle', dot: 'working', polls: 0 },
    { prev: 'idle', dot: 'idle', polls: 0 },
  ] as const)('polls $polls times when a dot goes from $prev to $dot', async ({ prev, dot, polls }) => {
    // given
    const { run } = github({});
    const prs = poller(() => [tab('1', ['/a'])], run);
    // when
    prs.dotChanged(dot, prev);
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(run).toHaveBeenCalledTimes(polls);
  });

  test('runs one more poll after the running one when refreshed during it', async () => {
    // given
    const { run } = github({});
    const prs = poller(() => [tab('1', ['/a'])], run);
    const running = prs.poll();
    // when
    prs.refresh();
    prs.refresh();
    await running;
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(run).toHaveBeenCalledTimes(2);
  });

  test('reports an error when one of the probed repos fails', async () => {
    // given
    const run = vi.fn<Runner>(() =>
      Promise.resolve({
        code: 1,
        stdout: JSON.stringify({
          data: { p0: { pullRequests: { nodes: [] } }, p1: null },
          errors: [{ message: 'Could not resolve', path: ['p1'] }],
        }),
        stderr: '',
      }),
    );
    const prs = poller(() => [tab('1', ['/wts/x-1'], { projectKey: 'XENA' })], run);
    await prs.poll();
    // when
    const result = await prs.latest('1', '/wts/x-1');
    // then
    expect(result.error).toBe('listing PRs in tahardi/dotclaude: Could not resolve');
  });
});
