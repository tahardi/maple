import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrInfo } from '@shared/types';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import type { Terminals } from '../terminals';
import { registerPr } from './pr';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const {
  handle,
  prForBranch,
  commentOnPr,
  commentOnLine,
  replyToComment,
  resolveThread,
  reviewComments,
  diffLines,
  headCommit,
  defaultRunner,
  currentBranch,
  changedSince,
} = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  prForBranch: vi.fn(),
  commentOnPr: vi.fn(),
  commentOnLine: vi.fn(),
  replyToComment: vi.fn(),
  resolveThread: vi.fn(),
  reviewComments: vi.fn(),
  diffLines: vi.fn(),
  headCommit: vi.fn(),
  defaultRunner: vi.fn(),
  currentBranch: vi.fn(),
  changedSince: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../git', () => ({ currentBranch, changedSince }));
vi.mock('../github', () => ({
  prForBranch,
  commentOnPr,
  commentOnLine,
  replyToComment,
  resolveThread,
  reviewComments,
  diffLines,
  headCommit,
}));
vi.mock('../preflight', () => ({ defaultRunner }));

const event = {} as IpcMainInvokeEvent;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const pr: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-13] GitHub Client',
  state: 'OPEN',
  deviations: 'None',
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  checks: { passed: 1, failed: 0, pending: 0, total: 1 },
};

function register(
  channel: string,
  worktree: string | null,
  sessions: SessionManager = {} as SessionManager,
): (...args: unknown[]) => Promise<unknown> {
  registerPr(
    {
      window: () => null,
      worktreeFor: () => worktree,
      project: () => Promise.resolve(null),
      sessions,
      terminals: {} as Terminals,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
    },
    logger,
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

function approver(worktree: string | null = '/wt', cardKey: string | null = 'DIG-44') {
  const calls: string[] = [];
  commentOnPr.mockImplementation(() => {
    calls.push('comment');
    return Promise.resolve();
  });
  const sendPrompt = vi.fn(() => {
    calls.push('prompt');
  });
  const sessions = { get: () => ({ cardKey }), sendPrompt } as unknown as SessionManager;
  return { approve: register('pr:approve', worktree, sessions), sendPrompt, calls };
}

describe('registerPr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prForBranch.mockReset();
    currentBranch.mockReset().mockResolvedValue('mpl-13-github-client');
  });

  test('get looks up the PR for the tab worktree branch', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: pr, error: null, fetchedAt: expect.any(String) as string });
    expect(currentBranch).toHaveBeenCalledWith('/wt');
    expect(prForBranch).toHaveBeenCalledWith(defaultRunner, '/wt', 'mpl-13-github-client');
  });

  test('get keeps the last good PR and its fetchedAt when a later lookup fails', async () => {
    // given
    prForBranch.mockResolvedValueOnce(pr).mockRejectedValueOnce(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    const first = (await prGet('t1')) as { fetchedAt: string };
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: pr, error: 'listing PRs: offline', fetchedAt: first.fetchedAt });
  });

  test.each([
    { name: 'the PR lookup', fail: () => prForBranch.mockRejectedValue(new Error('listing PRs: offline')) },
    { name: 'the branch lookup', fail: () => currentBranch.mockRejectedValue(new Error('listing PRs: offline')) },
  ])('get returns the error with no data when $name fails with nothing cached', async ({ fail }) => {
    // given
    fail();
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: null, error: 'listing PRs: offline', fetchedAt: null });
  });

  test('get never serves one tab the cached PR of another tab', async () => {
    // given
    prForBranch.mockResolvedValueOnce(pr).mockRejectedValueOnce(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    await prGet('t1');
    // when
    const result = await prGet('t2');
    // then
    expect(result).toEqual({ data: null, error: 'listing PRs: offline', fetchedAt: null });
  });

  test('get clears the error once a lookup succeeds again', async () => {
    // given
    prForBranch.mockRejectedValueOnce(new Error('listing PRs: offline')).mockResolvedValueOnce(pr);
    const prGet = get('/wt');
    await prGet('t1');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: pr, error: null, fetchedAt: expect.any(String) as string });
  });

  test('get returns no PR when the tab has no worktree', async () => {
    // given
    const prGet = get(null);
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
    expect(prForBranch).not.toHaveBeenCalled();
  });

  test('approve comments LGTM on the PR, then sends the card prompt', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt, calls } = approver();
    // when
    await approve('t1');
    // then
    expect(commentOnPr).toHaveBeenCalledWith(defaultRunner, '/wt', 33, 'LGTM');
    expect(sendPrompt).toHaveBeenCalledWith('t1', '/card DIG-44');
    expect(calls).toEqual(['comment', 'prompt']);
  });

  test('approve rejects and sends nothing when commenting fails', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt } = approver();
    commentOnPr.mockRejectedValue(new Error('commenting on PR: offline'));
    // when
    const result = approve('t1');
    // then
    await expect(result).rejects.toThrow('approving PR: commenting on PR: offline');
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, cardKey: 'DIG-44', want: 'tab has no card worktree' },
    { name: 'the tab has no card', worktree: '/wt', cardKey: null, want: 'tab has no card worktree' },
  ])('approve rejects and comments nothing when $name', async ({ worktree, cardKey, want }) => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt } = approver(worktree, cardKey);
    // when
    const result = approve('t1');
    // then
    await expect(result).rejects.toThrow(`approving PR: ${want}`);
    expect(prForBranch).not.toHaveBeenCalled();
    expect(commentOnPr).not.toHaveBeenCalled();
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'there is no PR', found: null },
    { name: 'the PR is merged', found: { ...pr, state: 'MERGED' as const } },
    { name: 'the PR is closed', found: { ...pr, state: 'CLOSED' as const } },
  ])('approve rejects and comments nothing when $name', async ({ found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const { approve, sendPrompt } = approver();
    // when
    const result = approve('t1');
    // then
    await expect(result).rejects.toThrow('approving PR: branch has no open PR');
    expect(commentOnPr).not.toHaveBeenCalled();
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('approve rejects with the cause when the PR lookup fails', async () => {
    // given
    prForBranch.mockRejectedValue(new Error('listing PRs: offline'));
    const { approve, sendPrompt } = approver();
    // when
    const result = approve('t1');
    // then
    await expect(result).rejects.toThrow('approving PR: listing PRs: offline');
    expect(commentOnPr).not.toHaveBeenCalled();
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('comment posts the line comment on the open PR', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    expect(commentOnLine).toHaveBeenCalledWith(defaultRunner, '/wt', 33, {
      path: 'src/a.ts',
      startLine: null,
      line: 3,
      body: 'why?',
    });
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
    prForBranch.mockResolvedValue(found);
    const comment = register('pr:comment', worktree);
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    await expect(result).rejects.toThrow(`commenting on line: ${want}`);
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test('comment rejects with the one prefix and logs the path and line when the post fails', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    commentOnLine.mockRejectedValueOnce(new Error('commenting on line: line must be part of the diff'));
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?');
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
    prForBranch.mockResolvedValue(pr);
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', 1, 3, 'why?');
    // then
    expect(commentOnLine).toHaveBeenCalledWith(defaultRunner, '/wt', 33, {
      path: 'src/a.ts',
      startLine: 1,
      line: 3,
      body: 'why?',
    });
  });

  test('reply posts on the open PR of the worktree branch', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const reply = register('pr:reply', '/wt');
    // when
    await reply('t1', 101, 'thanks');
    // then
    expect(replyToComment).toHaveBeenCalledWith(defaultRunner, '/wt', 33, 101, 'thanks');
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
    prForBranch.mockResolvedValue(found);
    const reply = register('pr:reply', worktree);
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(`replying to comment: ${want}`);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test('reply rejects with the one prefix when the PR lookup fails', async () => {
    // given
    prForBranch.mockRejectedValueOnce(new Error('listing PRs: offline'));
    const reply = register('pr:reply', '/wt');
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(/^replying to comment: listing PRs: offline$/);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test('reply logs the comment id when the post fails', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
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
    expect(resolveThread).toHaveBeenCalledWith(defaultRunner, '/wt', 'PRRT_101', true);
  });

  test('resolve unresolves the thread from the tab worktree', async () => {
    // given
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', false);
    // then
    expect(resolveThread).toHaveBeenCalledWith(defaultRunner, '/wt', 'PRRT_101', false);
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

  test('diffLines returns the PR diff ranges and the files that differ from the PR head', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    diffLines.mockResolvedValue({ 'src/a.ts': [[1, 4]] });
    headCommit.mockResolvedValue('abc123');
    changedSince.mockResolvedValue(['src/b.ts']);
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = await lines('t1');
    // then
    expect(result).toEqual({ ranges: { 'src/a.ts': [[1, 4]] }, unpushed: ['src/b.ts'] });
    expect(diffLines).toHaveBeenCalledWith(defaultRunner, '/wt', 33);
    expect(headCommit).toHaveBeenCalledWith(defaultRunner, '/wt', 33);
    expect(changedSince).toHaveBeenCalledWith('/wt', 'abc123');
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
  ])('diffLines returns none when $name', async ({ worktree, found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const lines = register('pr:diffLines', worktree);
    // when
    const result = await lines('t1');
    // then
    expect(result).toEqual({ ranges: {}, unpushed: [] });
    expect(diffLines).not.toHaveBeenCalled();
  });

  test('comment rejects with the one prefix when the PR lookup fails', async () => {
    // given
    prForBranch.mockRejectedValueOnce(new Error('listing PRs: offline'));
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    await expect(result).rejects.toThrow(/^commenting on line: listing PRs: offline$/);
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'the PR head lookup',
      fail: () => headCommit.mockRejectedValueOnce(new Error('reading PR head: offline')),
      error: 'reading PR head: offline',
    },
    {
      name: 'the unpushed files lookup',
      fail: () => changedSince.mockRejectedValueOnce(new Error('running git diff --name-only -z abc123: bad object')),
      error: 'running git diff --name-only -z abc123: bad object',
    },
  ])('logs a failed diffLines at warn and rejects when $name fails', async ({ fail, error }) => {
    // given
    prForBranch.mockResolvedValue(pr);
    diffLines.mockResolvedValue({});
    headCommit.mockResolvedValue('abc123');
    changedSince.mockResolvedValue([]);
    fail();
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = lines('t1');
    // then
    await expect(result).rejects.toThrow(error);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', { operation: 'pr:diffLines', tabId: 't1', error });
  });

  test('logs a failed diffLines lookup at warn and rejects', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    diffLines.mockRejectedValueOnce(new Error('listing PR files: offline'));
    headCommit.mockResolvedValue('abc123');
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = lines('t1');
    // then
    await expect(result).rejects.toThrow('listing PR files: offline');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:diffLines',
      tabId: 't1',
      error: 'listing PR files: offline',
    });
  });

  test('comments lists the review comments on the PR', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const found = [{ path: 'src/a.ts', line: 3, author: 'tahardi', body: 'why?' }];
    reviewComments.mockResolvedValue(found);
    const comments = register('pr:comments', '/wt');
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual(found);
    expect(reviewComments).toHaveBeenCalledWith(defaultRunner, '/wt', 33);
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
  ])('comments returns none when $name', async ({ worktree, found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const comments = register('pr:comments', worktree);
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual([]);
    expect(reviewComments).not.toHaveBeenCalled();
  });

  test('logs a failed comments lookup at warn and rejects', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
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

  test('logs a failed PR lookup at warn', async () => {
    // given
    prForBranch.mockRejectedValue(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    // when
    await prGet('t1');
    // then
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:get',
      tabId: 't1',
      error: 'listing PRs: offline',
    });
  });

  test('logs a failed approve at warn', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve } = approver();
    commentOnPr.mockRejectedValue(new Error('commenting on PR: offline'));
    // when
    await approve('t1').catch(() => undefined);
    // then
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:approve',
      tabId: 't1',
      error: 'commenting on PR: offline',
    });
  });
});
