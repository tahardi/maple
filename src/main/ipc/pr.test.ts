import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrInfo } from '@shared/types';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import type { Terminals } from '../terminals';
import { registerPr } from './pr';

type Handler = (event: IpcMainInvokeEvent, tabId: string) => Promise<unknown>;

const { handle, prForBranch, commentOnPr, defaultRunner, currentBranch } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  prForBranch: vi.fn(),
  commentOnPr: vi.fn(),
  defaultRunner: vi.fn(),
  currentBranch: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../git', () => ({ currentBranch }));
vi.mock('../github', () => ({ prForBranch, commentOnPr }));
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
): (tabId: string) => Promise<unknown> {
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
    },
    logger,
  );
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler for ${channel}`);
  }
  return (tabId) => call[1](event, tabId);
}

function get(worktree: string | null): (tabId: string) => Promise<unknown> {
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
