import { EventEmitter } from 'node:events';
import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Runner as CommandRunner } from '@main/app/preflight';
import type { PrEvents } from '@main/events/PrEvents';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import { registerPr } from './pr';
import type { StartQueue } from '@main/sessions/StartQueue';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const {
  handle,
  commentOnLine,
  replyToComment,
  resolveThread,
  reviewComments,
  diffLines,
  gh,
  reviewFiles,
  reviewFilePair,
  latestPr,
  refreshPrs,
  ghRunner,
} = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  commentOnLine: vi.fn(),
  replyToComment: vi.fn(),
  resolveThread: vi.fn(),
  reviewComments: vi.fn(),
  diffLines: vi.fn(),
  gh: vi.fn<CommandRunner>(),
  reviewFiles: vi.fn(),
  reviewFilePair: vi.fn(),
  latestPr: vi.fn(),
  refreshPrs: vi.fn(),
  ghRunner: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/github/pr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@main/github/pr')>()),
  diffLines,
}));
vi.mock('@main/github/comments', () => ({ commentOnLine, replyToComment, resolveThread, reviewComments }));
vi.mock('@main/github/ghRunner', () => ({ ghRunner }));
vi.mock('@main/github/reviewDiff', () => ({ reviewFiles, reviewFilePair }));

const event = {} as IpcMainInvokeEvent;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const events = { approved: vi.fn(), commented: vi.fn(), replied: vi.fn(), resolved: vi.fn() };
const eventTab = { projectKey: 'DIG', cardKey: 'DIG-44', worktreePath: '/wt', worktreePaths: ['/wt'] };
const pr: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-13] GitHub Client',
  state: 'OPEN',
  deviations: 'None',
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 1, failed: 0, pending: 0, total: 1, runs: [] },
};

const polled = (found: PrInfo | null) => ({ data: found, error: null, fetchedAt: '2026-11-12T00:00:00.000Z' });

const project: ProjectConfig = {
  name: 'Dig Days',
  jiraKey: 'DIG',
  jiraBoardId: 1,
  plannerDir: '/tmp/dig',
  repo: 'tahardi/dig-days',
  otherRepos: [],
};
const head = 'a'.repeat(40);
const base = 'c'.repeat(40);

function tabSessions(
  cardKey: string | null = 'DIG-44',
  projectKey = 'DIG',
  sendPrompt = vi.fn(),
  worktreePaths: readonly string[] = ['/wt'],
) {
  return {
    get: () => ({ projectKey, cardKey, worktreePath: '/wt', worktreePaths }),
    sendPrompt,
  } as unknown as SessionManager;
}

function register(
  channel: string,
  worktree: string | null | (() => string | null),
  sessions: SessionManager = tabSessions(),
): (...args: unknown[]) => Promise<unknown> {
  registerPr(
    {
      window: () => null,
      worktreeFor: typeof worktree === 'function' ? worktree : () => worktree,
      project: (key) => Promise.resolve(key === project.jiraKey ? project : null),
      sessions,
      terminals: {} as Terminals,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      configLoaded: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
      setSeen: () => Promise.resolve(),
      seen: () => Promise.resolve({}),
      startQueue: new EventEmitter() as StartQueue,
      prs: { latest: latestPr, refresh: refreshPrs },
      jira: new Promise<never>(() => undefined),
      jiraCreds: new Promise<never>(() => undefined),
      watchVault: () => undefined,
      findingsDir: '/tmp/maple/findings',
      decisionsDir: '/tmp/maple/decisions',
    },
    logger,
    events as unknown as PrEvents,
  );
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler for ${channel}`);
  }
  return (...args) => call[1](event, ...args);
}

function get(worktree: string | null): (...args: unknown[]) => Promise<unknown> {
  return register('pr:get', worktree);
}

type Reply = { code: number; stdout: string; stderr: string };

const ok = (stdout = ''): Reply => ({ code: 0, stdout, stderr: '' });

function approver(
  answers: Record<string, Reply> = {},
  worktree: string | null = '/wt',
  cardKey: string | null = 'DIG-44',
  worktreePaths: readonly string[] = ['/wt'],
) {
  const calls: string[] = [];
  gh.mockImplementation((_cmd, args) => {
    const key = args.join(' ');
    calls.push(key);
    return Promise.resolve(answers[key] ?? (key === viewRepo ? ok('main\n') : ok()));
  });
  const sendPrompt = vi.fn(() => {
    calls.push('prompt');
  });
  const sessions = tabSessions(cardKey, 'DIG', sendPrompt, worktreePaths);
  return { approve: register('pr:approve', worktree, sessions), sendPrompt, calls };
}

const viewPin = 'pr view 33 --json headRefOid,headRefName,baseRefName,isCrossRepository';
const viewRepo = 'api repos/{owner}/{repo} --jq .default_branch';
const pinned = (sha: string) =>
  ok(JSON.stringify({ headRefOid: sha, headRefName: 'dig-44-trail', baseRefName: 'main', isCrossRepository: false }));
const postReview = `api --method POST repos/{owner}/{repo}/pulls/33/reviews -f event=APPROVE -f commit_id=${head}`;
const merge = `pr merge 33 --squash --match-head-commit ${head}`;

describe('registerPr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ghRunner.mockReset().mockReturnValue(gh);
    latestPr.mockReset().mockResolvedValue(polled(pr));
  });

  test('get serves the poller latest result and runs no gh command', async () => {
    // given
    const fetched = { data: pr, error: null, fetchedAt: '2026-11-11T12:00:00.000Z' };
    latestPr.mockResolvedValue(fetched);
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual(fetched);
    expect(latestPr).toHaveBeenCalledWith('t1', '/wt');
    expect(gh).not.toHaveBeenCalled();
  });

  test('get returns the last good PR with the error when the poll failed', async () => {
    // given
    const fetched = { data: pr, error: 'listing PRs: offline', fetchedAt: '2026-11-11T12:00:00.000Z' };
    latestPr.mockResolvedValue(fetched);
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual(fetched);
  });

  test.each([
    { channel: 'pr:comment', args: ['t1', 'src/a.ts', null, 3, 'hi', head] },
    { channel: 'pr:reply', args: ['t1', 5, 'hi'] },
    { channel: 'pr:diffLines', args: ['t1', base, head] },
    { channel: 'pr:readFile', args: ['t1', 'src/a.ts', null, base, head] },
    { channel: 'pr:resolve', args: ['t1', 'thread-1', true] },
  ])('$channel runs in the repo of the tab PR', async ({ channel, args }) => {
    // given
    const call = register(channel, '/wt');
    // when
    await call(...args);
    // then
    expect(latestPr).toHaveBeenCalledWith('t1', '/wt');
    expect(ghRunner).toHaveBeenCalledTimes(1);
    expect(ghRunner).toHaveBeenCalledWith('tahardi/maple');
  });

  test.each([
    {
      channel: 'pr:readFile',
      args: ['t1', 'src/a.ts', null, base, head],
      want: /^reading PR file: listing PRs: offline$/,
    },
    {
      channel: 'pr:resolve',
      args: ['t1', 'thread-1', true],
      want: /^resolving thread: listing PRs: offline$/,
    },
  ])('$channel rejects with the poll error when the poller has no PR', async ({ channel, args, want }) => {
    // given
    latestPr.mockResolvedValue({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    const call = register(channel, '/wt');
    // when
    const result = call(...args);
    // then
    await expect(result).rejects.toThrow(want);
  });

  test('get returns no PR when the tab has no worktree', async () => {
    // given
    const prGet = get(null);
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
    expect(latestPr).not.toHaveBeenCalled();
  });

  test('pr:approve approves and merges the pinned commit, then prompts /card', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve, sendPrompt, calls } = approver({ [viewPin]: pinned(head) });
    // when
    await approve('t1', head);
    // then
    expect(calls).toEqual([viewPin, viewRepo, postReview, merge, 'prompt']);
    expect(sendPrompt).toHaveBeenCalledWith('t1', '/card DIG-44');
    expect(refreshPrs).toHaveBeenCalledTimes(1);
    expect(latestPr).toHaveBeenCalledWith('t1', '/wt');
    expect(ghRunner).toHaveBeenCalledWith('tahardi/maple');
    expect(logger.info).toHaveBeenCalledWith('gh', 'merged', {
      tabId: 't1',
      repo: 'tahardi/maple',
      number: 33,
      headSha: head,
    });
  });

  test('pr:approve merges the selected PR but holds /card while another worktree has an open PR', async () => {
    // given
    latestPr.mockImplementation((_tabId: string, worktree: string) =>
      Promise.resolve(polled(worktree === '/wt2' ? { ...pr, number: 34 } : pr)),
    );
    const { approve, sendPrompt, calls } = approver({ [viewPin]: pinned(head) }, '/wt', 'DIG-44', ['/wt', '/wt2']);
    // when
    await approve('t1', head);
    // then
    expect(calls).toContain(merge);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(latestPr).toHaveBeenCalledWith('t1', '/wt2');
    expect(logger.info).toHaveBeenCalledWith('gh', 'waiting for other PRs', { tabId: 't1', open: [34] });
  });

  test('pr:approve prompts /card once every other worktree PR is merged', async () => {
    // given
    latestPr.mockImplementation((_tabId: string, worktree: string) =>
      Promise.resolve(polled(worktree === '/wt2' ? { ...pr, state: 'MERGED' } : pr)),
    );
    const { approve, sendPrompt } = approver({ [viewPin]: pinned(head) }, '/wt', 'DIG-44', ['/wt', '/wt2']);
    // when
    await approve('t1', head);
    // then
    expect(sendPrompt).toHaveBeenCalledWith('t1', '/card DIG-44');
    const otherRead = latestPr.mock.calls.findIndex(([, worktree]) => worktree === '/wt2');
    expect(refreshPrs.mock.invocationCallOrder[0]).toBeLessThan(latestPr.mock.invocationCallOrder[otherRead]);
  });

  test.each([
    { name: 'another worktree has no PR', worktreePaths: ['/wt', '/wt2'] },
    { name: 'the tab lists no worktrees', worktreePaths: [] },
  ])('pr:approve prompts /card when $name', async ({ worktreePaths }) => {
    // given
    latestPr.mockImplementation((_tabId: string, worktree: string) =>
      Promise.resolve(polled(worktree === '/wt2' ? null : pr)),
    );
    const { approve, sendPrompt } = approver({ [viewPin]: pinned(head) }, '/wt', 'DIG-44', worktreePaths);
    // when
    await approve('t1', head);
    // then
    expect(sendPrompt).toHaveBeenCalledWith('t1', '/card DIG-44');
  });

  test("pr:approve holds /card when another worktree's PR lookup fails", async () => {
    // given
    latestPr.mockImplementation((_tabId: string, worktree: string) =>
      Promise.resolve(
        worktree === '/wt2' ? { data: null, error: 'listing PRs: offline', fetchedAt: null } : polled(pr),
      ),
    );
    const { approve, sendPrompt, calls } = approver({ [viewPin]: pinned(head) }, '/wt', 'DIG-44', ['/wt', '/wt2']);
    // when
    const result = approve('t1', head);
    // then
    await expect(result).resolves.toBeUndefined();
    expect(calls).toContain(merge);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:approve',
      tabId: 't1',
      error: 'listing PRs: offline',
    });
  });

  test.each([
    {
      name: 'pr:approve',
      args: ['t1', head],
      posted: () => gh.mock.calls.map(([, args]) => args.join(' ')).filter((c) => c === postReview || c === merge),
      want: [postReview, merge],
    },
    {
      name: 'pr:comment',
      args: ['t1', 'src/a.ts', null, 3, 'why?', head],
      posted: () => commentOnLine.mock.calls.map(([, , number]) => number as number),
      want: [33],
    },
    {
      name: 'pr:reply',
      args: ['t1', 101, 'thanks'],
      posted: () => replyToComment.mock.calls.map(([, , number]) => number as number),
      want: [33],
    },
  ])('$name acts on the last good PR when the latest poll failed', async ({ name, args, posted, want }) => {
    // given
    latestPr.mockResolvedValue({ data: pr, error: 'listing PRs: offline', fetchedAt: '2026-11-11T12:00:00.000Z' });
    const call = name === 'pr:approve' ? approver({ [viewPin]: pinned(head) }).approve : register(name, '/wt');
    // when
    const result = call(...args);
    // then
    await expect(result).resolves.toBeUndefined();
    expect(posted()).toEqual(want);
    expect(ghRunner).toHaveBeenCalledWith('tahardi/maple');
  });

  test('pr:approve records the approval after it merges', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve } = approver({ [viewPin]: pinned(head) });
    // when
    await approve('t1', head);
    // then
    expect(events.approved).toHaveBeenCalledWith(eventTab, pr);
  });

  test('pr:approve records nothing when the merge fails', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve } = approver({
      [viewPin]: pinned(head),
      [merge]: { code: 1, stdout: '', stderr: 'Head branch was modified' },
    });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow('merging');
    expect(events.approved).not.toHaveBeenCalled();
  });

  test('pr:approve refuses when the head moved', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve, sendPrompt, calls } = approver({ [viewPin]: pinned('d'.repeat(40)) });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(
      /^approving PR: the PR has new commits since the review loaded; Approve again once the review updates$/,
    );
    expect(calls).toEqual([viewPin, viewRepo]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve reports a failed review', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve, sendPrompt, calls } = approver({
      [viewPin]: pinned(head),
      [postReview]: { code: 1, stdout: '', stderr: 'HTTP 422' },
    });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: reviewing: HTTP 422$/);
    expect(calls).toEqual([viewPin, viewRepo, postReview]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve reports a failed merge', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve, sendPrompt } = approver({
      [viewPin]: pinned(head),
      [merge]: { code: 1, stdout: '', stderr: 'Head branch was modified' },
    });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: merging: Head branch was modified$/);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(refreshPrs).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:approve',
      tabId: 't1',
      error: 'approving PR: merging: Head branch was modified',
    });
  });

  test.each([
    { name: 'a short sha', sha: 'abc123' },
    { name: 'an upper-case sha', sha: 'A'.repeat(40) },
    { name: 'no sha', sha: undefined },
  ])('pr:approve rejects $name', ({ sha }) => {
    // given
    const { approve, calls } = approver();
    // when
    const result = () => approve('t1', sha);
    // then
    expect(result).toThrow('handling pr:approve: arguments are invalid');
    expect(calls).toEqual([]);
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, cardKey: 'DIG-44', want: 'tab has no card worktree' },
    { name: 'the tab has no card', worktree: '/wt', cardKey: null, want: 'tab has no card worktree' },
  ])('pr:approve rejects and calls nothing when $name', async ({ worktree, cardKey, want }) => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const { approve, sendPrompt, calls } = approver({}, worktree, cardKey);
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(`approving PR: ${want}`);
    expect(latestPr).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'there is no PR', found: null },
    { name: 'the PR is merged', found: { ...pr, state: 'MERGED' as const } },
    { name: 'the PR is closed', found: { ...pr, state: 'CLOSED' as const } },
  ])('pr:approve rejects and calls nothing when $name', async ({ found }) => {
    // given
    latestPr.mockResolvedValue(polled(found));
    const { approve, sendPrompt, calls } = approver();
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow('approving PR: branch has no open PR');
    expect(calls).toEqual([]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve rejects with the poll error when the poller has no PR', async () => {
    // given
    latestPr.mockResolvedValue({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    const { approve, sendPrompt } = approver();
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: listing PRs: offline$/);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:review returns the files for the open PR', async () => {
    // given
    latestPr.mockResolvedValue({ data: pr, error: null, fetchedAt: null });
    const files = [{ path: 'src/a.ts', status: 'M', oldPath: null, stamp: 'f'.repeat(40) }];
    reviewFiles.mockResolvedValue({ number: 33, headSha: head, baseSha: base, files });
    const review = register('pr:review', '/wt');
    // when
    const result = await review('t1');
    // then
    expect(result).toEqual({
      data: { number: 33, headSha: head, baseSha: base, files },
      error: null,
      fetchedAt: expect.any(String) as string,
    });
    expect(reviewFiles).toHaveBeenCalledWith(gh, 33);
    expect(latestPr).toHaveBeenCalledWith('t1', '/wt');
    expect(ghRunner).toHaveBeenCalledWith('tahardi/maple');
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
    { name: 'the PR is merged', worktree: '/wt', found: { ...pr, state: 'MERGED' as const } },
  ])('pr:review returns no review when $name', async ({ worktree, found }) => {
    // given
    latestPr.mockResolvedValue({ data: found, error: null, fetchedAt: null });
    const review = register('pr:review', worktree);
    // when
    const result = await review('t1');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
    expect(reviewFiles).not.toHaveBeenCalled();
  });

  test('pr:review returns the poll error when the poller has no PR', async () => {
    // given
    latestPr.mockResolvedValue({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    const review = register('pr:review', '/wt');
    // when
    const result = await review('t1');
    // then
    expect(result).toEqual({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    expect(reviewFiles).not.toHaveBeenCalled();
  });

  test('pr:review returns and logs the error when the fetch fails', async () => {
    // given
    latestPr.mockResolvedValue({ data: pr, error: null, fetchedAt: null });
    reviewFiles.mockRejectedValue(new Error('fetching review: the PR head moved, try again'));
    const review = register('pr:review', '/wt');
    // when
    const result = await review('t1');
    // then
    const error = 'fetching review: the PR head moved, try again';
    expect(result).toEqual({ data: null, error, fetchedAt: null });
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', { operation: 'pr:review', tabId: 't1', error });
  });

  test('pr:readFile logs and rethrows a failed read', async () => {
    // given
    reviewFilePair.mockRejectedValue(new Error('fetching review: HTTP 502'));
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = readFile('t1', 'src/a.ts', null, base, head);
    // then
    await expect(result).rejects.toThrow('fetching review: HTTP 502');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:readFile',
      tabId: 't1',
      path: 'src/a.ts',
      error: 'fetching review: HTTP 502',
    });
  });

  test('pr:readFile reads from GitHub at the given commits', async () => {
    // given
    const pair = { kind: 'text', path: 'src/a.ts', base: 'old\n', current: 'new\n' };
    reviewFilePair.mockResolvedValue(pair);
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = await readFile('t1', 'src/a.ts', 'src/old.ts', base, head);
    // then
    expect(result).toEqual(pair);
    expect(reviewFilePair).toHaveBeenCalledWith(gh, 'src/a.ts', 'src/old.ts', base, head);
    expect(ghRunner).toHaveBeenCalledWith('tahardi/maple');
  });

  test('readFile rejects and reads nothing when the tab has no worktree', async () => {
    // given
    const readFile = register('pr:readFile', null);
    // when
    const result = readFile('t1', 'src/a.ts', null, base, head);
    // then
    await expect(result).rejects.toThrow(/^reading PR file: tab has no PR$/);
    expect(latestPr).not.toHaveBeenCalled();
    expect(ghRunner).not.toHaveBeenCalled();
    expect(reviewFilePair).not.toHaveBeenCalled();
  });

  test('readFile rejects when the tab has no PR', async () => {
    // given
    latestPr.mockResolvedValue(polled(null));
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = readFile('t1', 'src/a.ts', null, base, head);
    // then
    await expect(result).rejects.toThrow(/^reading PR file: tab has no PR$/);
    expect(reviewFilePair).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'a bad base sha', path: 'src/a.ts', baseSha: 'main', headSha: head },
    { name: 'a bad head sha', path: 'src/a.ts', baseSha: base, headSha: 'HEAD' },
    { name: 'an empty path', path: '', baseSha: base, headSha: head },
    { name: 'a path that is too long', path: 'a'.repeat(4097), baseSha: base, headSha: head },
  ])('pr:readFile rejects $name', ({ path, baseSha, headSha }) => {
    // given
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = () => readFile('t1', path, null, baseSha, headSha);
    // then
    expect(result).toThrow('handling pr:readFile: arguments are invalid');
    expect(reviewFilePair).not.toHaveBeenCalled();
  });

  test('comment posts the line comment pinned to the given commit', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', null, 3, 'why?', head);
    // then
    expect(commentOnLine).toHaveBeenCalledWith(gh, '/wt', 33, head, {
      path: 'src/a.ts',
      startLine: null,
      line: 3,
      body: 'why?',
    });
  });

  test('comment records the comment length after it posts', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', null, 3, 'why?', head);
    // then
    expect(events.commented).toHaveBeenCalledWith(eventTab, pr, 4);
  });

  test('comment records nothing when the post fails', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    commentOnLine.mockRejectedValueOnce(new Error('commenting on line: line must be part of the diff'));
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?', head);
    // then
    await expect(result).rejects.toThrow('line must be part of the diff');
    expect(events.commented).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'the PR is merged',
      worktree: '/wt',
      found: { ...pr, state: 'MERGED' as const },
      want: 'branch has no open PR',
    },
    { name: 'there is no PR', worktree: '/wt', found: null, want: 'branch has no open PR' },
    { name: 'the tab has no worktree', worktree: null, found: pr, want: 'tab has no card worktree' },
  ])('comment rejects and posts nothing when $name', async ({ worktree, found, want }) => {
    // given
    latestPr.mockResolvedValue(polled(found));
    const comment = register('pr:comment', worktree);
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?', head);
    // then
    await expect(result).rejects.toThrow(`commenting on line: ${want}`);
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test('comment rejects with the one prefix and logs the path and line when the post fails', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    commentOnLine.mockRejectedValueOnce(new Error('commenting on line: line must be part of the diff'));
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?', head);
    // then
    await expect(result).rejects.toThrow(/^commenting on line: line must be part of the diff$/);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:comment',
      tabId: 't1',
      path: 'src/a.ts',
      startLine: null,
      line: 3,
      error: 'commenting on line: line must be part of the diff',
    });
  });

  test('comment posts on a range of lines', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', 1, 3, 'why?', head);
    // then
    expect(commentOnLine).toHaveBeenCalledWith(gh, '/wt', 33, head, {
      path: 'src/a.ts',
      startLine: 1,
      line: 3,
      body: 'why?',
    });
  });

  test('reply posts on the open PR the poller holds', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const reply = register('pr:reply', '/wt');
    // when
    await reply('t1', 101, 'thanks');
    // then
    expect(replyToComment).toHaveBeenCalledWith(gh, '/wt', 33, 101, 'thanks');
  });

  test('reply records the reply length after it posts', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    const reply = register('pr:reply', '/wt');
    // when
    await reply('t1', 101, 'thanks');
    // then
    expect(events.replied).toHaveBeenCalledWith(eventTab, pr, 101, 6);
  });

  test('reply succeeds and records nothing when the tab closes during the post', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    let open = true;
    const sessions = { get: vi.fn(() => (open ? eventTab : null)) } as unknown as SessionManager;
    replyToComment.mockImplementationOnce(() => {
      open = false;
      return Promise.resolve();
    });
    const reply = register('pr:reply', '/wt', sessions);
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).resolves.toBeUndefined();
    expect(events.replied).not.toHaveBeenCalled();
  });

  test('reply records nothing when the post fails', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    replyToComment.mockRejectedValueOnce(new Error('replying to comment: not found'));
    const reply = register('pr:reply', '/wt');
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow('not found');
    expect(events.replied).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'the PR is merged',
      worktree: '/wt',
      found: { ...pr, state: 'MERGED' as const },
      want: 'branch has no open PR',
    },
    { name: 'there is no PR', worktree: '/wt', found: null, want: 'branch has no open PR' },
    { name: 'the tab has no worktree', worktree: null, found: pr, want: 'tab has no card worktree' },
  ])('reply rejects and posts nothing when $name', async ({ worktree, found, want }) => {
    // given
    latestPr.mockResolvedValue(polled(found));
    const reply = register('pr:reply', worktree);
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(`replying to comment: ${want}`);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test('reply rejects with the one prefix when the PR lookup fails', async () => {
    // given
    latestPr.mockResolvedValueOnce({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    const reply = register('pr:reply', '/wt');
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(/^replying to comment: listing PRs: offline$/);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test('reply logs the comment id when the post fails', async () => {
    // given
    latestPr.mockResolvedValue(polled(pr));
    replyToComment.mockRejectedValueOnce(new Error('replying to comment: not found'));
    const reply = register('pr:reply', '/wt');
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(/^replying to comment: not found$/);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:reply',
      tabId: 't1',
      commentId: 101,
      error: 'replying to comment: not found',
    });
  });

  test('resolve resolves the thread from the tab worktree', async () => {
    // given
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', true);
    // then
    expect(resolveThread).toHaveBeenCalledWith(gh, '/wt', 'PRRT_101', true);
  });

  test('resolve records the thread after it resolves', async () => {
    // given
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', true);
    // then
    expect(events.resolved).toHaveBeenCalledWith(eventTab, 'PRRT_101', true);
  });

  test('resolve records nothing when it fails', async () => {
    // given
    resolveThread.mockRejectedValueOnce(new Error('resolving thread: not found'));
    const resolve = register('pr:resolve', '/wt');
    // when
    const result = resolve('t1', 'PRRT_101', true);
    // then
    await expect(result).rejects.toThrow('not found');
    expect(events.resolved).not.toHaveBeenCalled();
  });

  test('resolve unresolves the thread from the tab worktree', async () => {
    // given
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', false);
    // then
    expect(resolveThread).toHaveBeenCalledWith(gh, '/wt', 'PRRT_101', false);
    expect(events.resolved).toHaveBeenCalledWith(eventTab, 'PRRT_101', false);
  });

  test('resolve rejects and resolves nothing when the tab has no worktree', async () => {
    // given
    const resolve = register('pr:resolve', null);
    // when
    const result = resolve('t1', 'PRRT_101', true);
    // then
    await expect(result).rejects.toThrow('resolving thread: tab has no card worktree');
    expect(resolveThread).not.toHaveBeenCalled();
  });

  test('resolve logs the thread id when it fails', async () => {
    // given
    resolveThread.mockRejectedValueOnce(new Error('resolving thread: not found'));
    const resolve = register('pr:resolve', '/wt');
    // when
    const result = resolve('t1', 'PRRT_101', true);
    // then
    await expect(result).rejects.toThrow(/^resolving thread: not found$/);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:resolve',
      tabId: 't1',
      threadId: 'PRRT_101',
      resolved: true,
      error: 'resolving thread: not found',
    });
  });

  test('diffLines returns the ranges at the given commits', async () => {
    // given
    diffLines.mockResolvedValue({ 'src/a.ts': [[1, 4]] });
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = await lines('t1', base, head);
    // then
    expect(result).toEqual({ ranges: { 'src/a.ts': [[1, 4]] } });
    expect(diffLines).toHaveBeenCalledWith(gh, '/wt', base, head);
  });

  test('diffLines rejects when the tab has no PR', async () => {
    // given
    latestPr.mockResolvedValue(polled(null));
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = lines('t1', base, head);
    // then
    await expect(result).rejects.toThrow(/^listing PR files: tab has no PR$/);
    expect(diffLines).not.toHaveBeenCalled();
  });

  test('resolve runs in the repo of the tab PR', async () => {
    // given
    latestPr.mockResolvedValue(polled({ ...pr, url: 'https://github.com/tahardi/xena/pull/9' }));
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', true);
    // then
    expect(ghRunner).toHaveBeenCalledWith('tahardi/xena');
    expect(resolveThread).toHaveBeenCalledWith(gh, '/wt', 'PRRT_101', true);
  });

  test.each([{ name: 'the tab has no worktree', worktree: null }])(
    'diffLines returns none when $name',
    async ({ worktree }) => {
      // given
      const lines = register('pr:diffLines', worktree);
      // when
      const result = await lines('t1', base, head);
      // then
      expect(result).toEqual({ ranges: {} });
      expect(diffLines).not.toHaveBeenCalled();
    },
  );

  test.each([
    { name: 'a bad base sha', baseSha: 'main', headSha: head },
    { name: 'a bad head sha', baseSha: base, headSha: 'HEAD' },
  ])('diffLines rejects $name', ({ baseSha, headSha }) => {
    // given
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = () => lines('t1', baseSha, headSha);
    // then
    expect(result).toThrow('handling pr:diffLines: arguments are invalid');
    expect(diffLines).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'a short sha', headSha: 'a'.repeat(39) },
    { name: 'a ref name', headSha: 'HEAD' },
  ])('comment rejects $name', ({ headSha }) => {
    // given
    const comment = register('pr:comment', '/wt');
    // when
    const result = () => comment('t1', 'src/a.ts', null, 3, 'why?', headSha);
    // then
    expect(result).toThrow('handling pr:comment: arguments are invalid');
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test('comment rejects with the one prefix when the PR lookup fails', async () => {
    // given
    latestPr.mockResolvedValueOnce({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?', head);
    // then
    await expect(result).rejects.toThrow(/^commenting on line: listing PRs: offline$/);
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test('logs a failed diffLines lookup at warn and rejects', async () => {
    // given
    diffLines.mockRejectedValueOnce(new Error('listing PR files: offline'));
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = lines('t1', base, head);
    // then
    await expect(result).rejects.toThrow('listing PR files: offline');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:diffLines',
      tabId: 't1',
      error: 'listing PR files: offline',
    });
  });

  test('comments lists the review comments on the poller PR in its repo', async () => {
    // given
    latestPr.mockResolvedValue({ data: pr, error: null, fetchedAt: '2026-11-11T12:00:00.000Z' });
    const found = [{ path: 'src/a.ts', line: 3, author: 'tahardi', body: 'why?' }];
    reviewComments.mockResolvedValue(found);
    const comments = register('pr:comments', '/wt');
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual(found);
    expect(latestPr).toHaveBeenCalledWith('t1', '/wt');
    expect(ghRunner).toHaveBeenCalledWith('tahardi/maple');
    expect(reviewComments).toHaveBeenCalledWith(gh, '/wt', 33);
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
  ])('comments returns none when $name', async ({ worktree, found }) => {
    // given
    latestPr.mockResolvedValue({ data: found, error: null, fetchedAt: null });
    const comments = register('pr:comments', worktree);
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual([]);
    expect(reviewComments).not.toHaveBeenCalled();
  });

  test('comments lists the comments on the last good PR when the latest poll failed', async () => {
    // given
    latestPr.mockResolvedValue({ data: pr, error: 'listing PRs: offline', fetchedAt: '2026-11-11T12:00:00.000Z' });
    reviewComments.mockResolvedValue([]);
    const comments = register('pr:comments', '/wt');
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual([]);
    expect(reviewComments).toHaveBeenCalledWith(gh, '/wt', 33);
  });

  test('comments rejects with the poll error when the poller has no PR', async () => {
    // given
    latestPr.mockResolvedValue({ data: null, error: 'listing PRs: offline', fetchedAt: null });
    const comments = register('pr:comments', '/wt');
    // when
    const result = comments('t1');
    // then
    await expect(result).rejects.toThrow('listing PRs: offline');
    expect(reviewComments).not.toHaveBeenCalled();
  });

  test('logs a failed comments lookup at warn and rejects', async () => {
    // given
    latestPr.mockResolvedValue({ data: pr, error: null, fetchedAt: '2026-11-11T12:00:00.000Z' });
    reviewComments.mockRejectedValue(new Error('listing review comments: offline'));
    const comments = register('pr:comments', '/wt');
    // when
    const result = comments('t1');
    // then
    await expect(result).rejects.toThrow('listing review comments: offline');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:comments',
      tabId: 't1',
      error: 'listing review comments: offline',
    });
  });
});
