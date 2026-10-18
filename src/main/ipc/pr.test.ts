import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrInfo } from '@shared/types';
import { registerPr } from './pr';

type Handler = (event: IpcMainInvokeEvent, tabId: string) => Promise<unknown>;

const { handle, prForBranch, defaultRunner, currentBranch } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  prForBranch: vi.fn(),
  defaultRunner: vi.fn(),
  currentBranch: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../git', () => ({ currentBranch }));
vi.mock('../github', () => ({ prForBranch }));
vi.mock('../preflight', () => ({ defaultRunner }));

const event = {} as IpcMainInvokeEvent;
const pr: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-13] GitHub Client',
  state: 'OPEN',
  deviations: 'None',
  needsTaylor: null,
  checks: { passed: 1, failed: 0, pending: 0, total: 1 },
};

function get(worktree: string | null): (tabId: string) => Promise<unknown> {
  registerPr({ window: () => null, worktreeFor: () => worktree, project: () => null });
  const call = handle.mock.calls.find(([name]) => name === 'pr:get');
  if (!call) {
    throw new Error('finding handler for pr:get');
  }
  return (tabId) => call[1](event, tabId);
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

  test('get returns the error with no data when nothing is cached', async () => {
    // given
    prForBranch.mockRejectedValue(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: null, error: 'listing PRs: offline', fetchedAt: null });
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
});
