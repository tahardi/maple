import type { Fetched } from '@shared/types/app';
import type { Review } from '@shared/types/github';
import type { RepoInfo } from '@shared/types/files';
import type { SessionCost, TabState } from '@shared/types/tabs';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { useCardData } from './useCardData';

type RejectionListener = (reason: unknown, promise: unknown) => void;

declare const process: {
  listeners(event: 'unhandledRejection'): RejectionListener[];
  removeAllListeners(event: 'unhandledRejection'): void;
  on(event: 'unhandledRejection', listener: RejectionListener): void;
  off(event: 'unhandledRejection', listener: RejectionListener): void;
};

const tab: TabState = {
  id: 't1',
  projectKey: 'BEAR',
  kind: 'card',
  cardKey: 'BEAR-1',
  sessionId: 's1',
  worktreePath: '/tmp/wts/bearclave-bear-1-thing',
};

describe('useCardData', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('loads the session cost for the tab', async () => {
    // given
    const want: SessionCost = {
      inputTokens: 1,
      outputTokens: 2,
      cacheWriteTokens: 3,
      cacheReadTokens: 4,
      dollars: 0.01,
    };
    const cost = vi.fn<(tabId: string) => Promise<SessionCost | null>>(() => Promise.resolve(want));
    fakeMaple({ tabs: { cost } });
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.cost).toEqual(want);
    });
    expect(cost).toHaveBeenCalledWith('t1');
  });

  test('loads the repo name and branch for a tab with a worktree', async () => {
    // given
    const want: RepoInfo = { name: 'bearclave', branch: 'bear-1-thing' };
    const info = vi.fn<(tabId: string) => Promise<RepoInfo | null>>(() => Promise.resolve(want));
    fakeMaple({ repo: { info } });
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.repo).toEqual(want);
    });
    expect(info).toHaveBeenCalledWith('t1');
  });

  test('skips the repo info for a tab without a worktree', async () => {
    // given
    const want: SessionCost = {
      inputTokens: 1,
      outputTokens: 2,
      cacheWriteTokens: 3,
      cacheReadTokens: 4,
      dollars: 0.01,
    };
    const info = vi.fn<(tabId: string) => Promise<RepoInfo | null>>(() => Promise.resolve(null));
    fakeMaple({ repo: { info }, tabs: { cost: () => Promise.resolve(want) } });
    // when
    const { result } = renderHook(() => useCardData({ ...tab, worktreePath: null }));
    // then
    await waitFor(() => {
      expect(result.current.cost).toEqual(want);
    });
    expect(info).not.toHaveBeenCalled();
    expect(result.current.repo).toBeNull();
  });

  test('leaves the repo info empty when the changes fail', async () => {
    // given
    const info = vi.fn<(tabId: string) => Promise<RepoInfo | null>>(() =>
      Promise.resolve({ name: 'bearclave', branch: 'bear-1-thing' }),
    );
    const failure = new Error('running git merge-base: no origin/main');
    const changes = vi.fn(() => Promise.reject(failure));
    fakeMaple({ repo: { changes, info } });
    const rejected = vi.fn();
    const listeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', rejected);
    onTestFinished(() => {
      process.off('unhandledRejection', rejected);
      listeners.forEach((listener) => {
        process.on('unhandledRejection', listener);
      });
    });
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(rejected).toHaveBeenCalledWith(failure, expect.anything());
    });
    expect(info).toHaveBeenCalledWith('t1');
    expect(result.current.repo).toBeNull();
  });

  test('picks up a new branch when the repo changes', async () => {
    // given
    let changed: () => void = vi.fn();
    const info = vi
      .fn<(tabId: string) => Promise<RepoInfo | null>>()
      .mockResolvedValueOnce({ name: 'bearclave', branch: 'old' })
      .mockResolvedValue({ name: 'bearclave', branch: 'new' });
    fakeMaple({
      repo: {
        info,
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
    });
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.repo?.branch).toBe('old');
    });
    // when
    act(() => {
      changed();
    });
    // then
    await waitFor(() => {
      expect(result.current.repo?.branch).toBe('new');
    });
  });

  test('refreshes on repo changes and when the tab goes idle', async () => {
    // given
    let changed: () => void = vi.fn();
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({
      repo: {
        changes,
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
    });
    renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      changed();
    });
    act(() => {
      useMaple
        .getState()
        .setStatus({ tabId: 't1', dot: 'idle', sessionAlive: true, exitCode: null, resumeFailed: false });
    });
    // then
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(3);
    });
  });

  test.each([
    { dot: 'idle' as const, calls: 2 },
    { dot: 'ready' as const, calls: 2 },
    { dot: 'merged' as const, calls: 2 },
    { dot: 'waiting' as const, calls: 2 },
    { dot: 'working' as const, calls: 1 },
  ])('a $dot status refreshes $calls times in total', async ({ dot, calls }) => {
    // given
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({ repo: { changes } });
    renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      useMaple.getState().setStatus({ tabId: 't1', dot, sessionAlive: true, exitCode: null, resumeFailed: false });
    });
    // then
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(calls);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(changes).toHaveBeenCalledTimes(calls);
  });

  test('refreshes every 60 seconds and stops after unmount', () => {
    // given
    vi.useFakeTimers();
    const changes = vi.fn(() => Promise.resolve(null));
    const unsubscribe = vi.fn();
    fakeMaple({ repo: { changes, onChanged: vi.fn(() => unsubscribe) } });
    const { unmount } = renderHook(() => useCardData(tab));
    // when
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    vi.useRealTimers();
    // then
    expect(changes).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('finds the card in the sprint and skips the repo without a worktree', async () => {
    // given
    const card = {
      key: 'BEAR-1',
      summary: 'Thing',
      status: 'In Progress' as const,
      points: 1,
      labels: [],
      blockedBy: [],
      epic: null,
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/BEAR-1',
    };
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({
      repo: { changes },
      jira: {
        sprint: () =>
          Promise.resolve({
            data: { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] },
            error: null,
            fetchedAt: null,
          }),
      },
    });
    // when
    const { result } = renderHook(() => useCardData({ ...tab, worktreePath: null }));
    // then
    await waitFor(() => {
      expect(result.current.card).toEqual(card);
    });
    expect(changes).not.toHaveBeenCalled();
  });

  test('a slow load from before the worktree appeared does not overwrite the files', async () => {
    // given
    let finishFirst: () => void = () => undefined;
    const first = new Promise<{ data: null; error: null; fetchedAt: null }>((resolve) => {
      finishFirst = () => {
        resolve({ data: null, error: null, fetchedAt: null });
      };
    });
    const get = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ data: null, error: null, fetchedAt: null });
    fakeMaple({ pr: { get }, repo: { listFiles: vi.fn(() => Promise.resolve(['a.go'])) } });
    const noWorktree: TabState = { ...tab, worktreePath: null };
    const { result, rerender } = renderHook((t: TabState) => useCardData(t), { initialProps: noWorktree });
    rerender(tab);
    await waitFor(() => {
      expect(result.current.files).toEqual(['a.go']);
    });
    // when
    await act(async () => {
      finishFirst();
      await first;
    });
    // then
    expect(result.current.files).toEqual(['a.go']);
  });

  test('loads the review with the PR', async () => {
    // given
    const want: Fetched<Review> = {
      data: { number: 7, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), files: [], findings: [] },
      error: null,
      fetchedAt: '2026-10-28T12:00:00.000Z',
    };
    const review = vi.fn<(tabId: string) => Promise<Fetched<Review>>>(() => Promise.resolve(want));
    fakeMaple({ pr: { review } });
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.review).toEqual(want);
    });
    expect(review).toHaveBeenCalledWith('t1');
  });
});
