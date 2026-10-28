import type { Fetched } from '@shared/types/app';
import type { Review } from '@shared/types/github';
import type { SessionCost, TabState } from '@shared/types/tabs';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { useCardData } from './useCardData';

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
