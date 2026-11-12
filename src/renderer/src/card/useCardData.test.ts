import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
import type { RepoInfo } from '@shared/types/files/repoInfo';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import type { TabState } from '@shared/types/tabs/tabState';
import type { Sprint } from '@shared/types/jira/sprint';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { card, SPRINT } from '../testing/sprintFixture';
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
  worktreePaths: [],
};

const openPr: PrInfo = {
  number: 7,
  url: 'https://github.com/tahardi/bearclave/pull/7',
  title: '[BEAR-1] Thing',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 1, failed: 0, pending: 0, total: 1, runs: [] },
};

const reviewData: Review = {
  number: 7,
  headSha: 'a'.repeat(40),
  baseSha: 'b'.repeat(40),
  added: 0,
  removed: 0,
  files: [],
  findings: [],
};

const fetchedReview: Fetched<Review> = { data: reviewData, error: null, fetchedAt: '2026-10-28T12:00:00.000Z' };

const moved = 'd'.repeat(40);

const atMoved: Fetched<Review> = { ...fetchedReview, data: { ...reviewData, headSha: moved } };

function watchRejections(): RejectionListener {
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
  return rejected;
}

describe('useCardData', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ activeTabId: 't1' });
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
    const want: RepoInfo = { name: 'bearclave', branch: 'bear-1-thing', hasTry: false };
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

  test('loads the repo info and files when the changes fail', async () => {
    // given
    const want: RepoInfo = { name: 'bearclave', branch: 'bear-1-thing', hasTry: false };
    const info = vi.fn<(tabId: string) => Promise<RepoInfo | null>>(() => Promise.resolve(want));
    const changes = vi.fn(() => Promise.reject(new Error('running git merge-base: no origin/main')));
    const listFiles = vi.fn(() => Promise.resolve(['a.go']));
    fakeMaple({ repo: { changes, info, listFiles } });
    const rejected = watchRejections();
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.repo).toEqual(want);
    });
    expect(result.current.files).toEqual(['a.go']);
    expect(result.current.changes).toBeNull();
    expect(rejected).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'the repo info',
      fail: 'info' as const,
      check: (current: ReturnType<typeof useCardData>) => {
        expect(current.files).toEqual(['a.go']);
      },
    },
    {
      name: 'the file list',
      fail: 'listFiles' as const,
      check: (current: ReturnType<typeof useCardData>) => {
        expect(current.repo).toEqual({ name: 'bearclave', branch: 'bear-1-thing', hasTry: false });
      },
    },
  ])('loads the changes when $name fails', async ({ fail, check }) => {
    // given
    const want = { base: 'b', files: [], added: 1, removed: 0 };
    fakeMaple({
      repo: {
        changes: () => Promise.resolve(want),
        info: () => Promise.resolve({ name: 'bearclave', branch: 'bear-1-thing', hasTry: false }),
        listFiles: () => Promise.resolve(['a.go']),
        [fail]: () => Promise.reject(new Error('running git: not a repo')),
      },
    });
    const rejected = watchRejections();
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.changes).toEqual(want);
    });
    check(result.current);
    expect(rejected).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'the PR', fail: { pr: { get: () => Promise.reject(new Error('running gh: offline')) } } },
    { name: 'the sprint', fail: { jira: { sprint: () => Promise.reject(new Error('fetching sprint: offline')) } } },
    { name: 'the cost', fail: { tabs: { cost: () => Promise.reject(new Error('reading transcript: gone')) } } },
  ])('loads the repo info when $name fails', async ({ fail }) => {
    // given
    const want: RepoInfo = { name: 'bearclave', branch: 'bear-1-thing', hasTry: false };
    fakeMaple({ ...fail, repo: { info: () => Promise.resolve(want) } });
    const rejected = watchRejections();
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.repo).toEqual(want);
    });
    expect(rejected).not.toHaveBeenCalled();
  });

  test('picks up a new branch when the repo changes', async () => {
    // given
    let changed: () => void = vi.fn();
    const info = vi
      .fn<(tabId: string) => Promise<RepoInfo | null>>()
      .mockResolvedValueOnce({ name: 'bearclave', branch: 'old', hasTry: false })
      .mockResolvedValue({ name: 'bearclave', branch: 'new', hasTry: false });
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
        .setStatus({ tabId: 't1', dot: 'idle', sessionAlive: true, exitCode: null, resumeFailed: false, sync: null });
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
      useMaple
        .getState()
        .setStatus({ tabId: 't1', dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null });
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

  test('a hidden tab skips the timer and repo changes', () => {
    // given
    vi.useFakeTimers();
    useMaple.setState({ activeTabId: 'other' });
    let changed: () => void = () => undefined;
    const changes = vi.fn(() => Promise.resolve(null));
    const sprint = vi.fn(() => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }));
    fakeMaple({
      repo: {
        changes,
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
      jira: { sprint },
    });
    renderHook(() => useCardData(tab));
    // when
    act(() => {
      vi.advanceTimersByTime(60_000);
      changed();
    });
    vi.useRealTimers();
    // then
    expect(changes).not.toHaveBeenCalled();
    expect(sprint).not.toHaveBeenCalled();
  });

  test('a tab that is hidden stops its timer and repo changes', async () => {
    // given
    const unsubscribe = vi.fn();
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({ repo: { changes, onChanged: vi.fn(() => unsubscribe) } });
    renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(1);
    });
    vi.useFakeTimers();
    // when
    act(() => {
      useMaple.setState({ activeTabId: 'other' });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    vi.useRealTimers();
    // then
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  test('a hidden tab loads as soon as it is shown', async () => {
    // given
    useMaple.setState({ activeTabId: 'other' });
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({ repo: { changes } });
    renderHook(() => useCardData(tab));
    // when
    act(() => {
      useMaple.setState({ activeTabId: 't1' });
    });
    // then
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(1);
    });
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

  test.each<{ name: string; sprint: () => Promise<Fetched<Sprint>>; outside: boolean }>([
    {
      name: 'a sprint without the card',
      sprint: () => Promise.resolve({ data: { ...SPRINT, cards: [] }, error: null, fetchedAt: null }),
      outside: true,
    },
    {
      name: 'a sprint with the card',
      sprint: () =>
        Promise.resolve({ data: { ...SPRINT, cards: [card('BEAR-1', 'To Do')] }, error: null, fetchedAt: null }),
      outside: false,
    },
    {
      name: 'a failed sprint lookup',
      sprint: () => Promise.resolve({ data: null, error: 'boom', fetchedAt: null }),
      outside: false,
    },
    { name: 'a rejected sprint lookup', sprint: () => Promise.reject(new Error('boom')), outside: false },
  ])('with $name the card outside the sprint is $outside', async ({ sprint, outside }) => {
    // given
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: null, error: null, fetchedAt: null }) },
      jira: { sprint },
    });
    // when
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.pr).not.toBeNull();
    });
    // then
    expect(result.current.outsideSprint).toBe(outside);
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

  test('loads the review once when an open PR appears, not on later refreshes', async () => {
    // given
    let changed: () => void = vi.fn();
    const review = vi.fn<(tabId: string) => Promise<Fetched<Review>>>(() => Promise.resolve(fetchedReview));
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: openPr, error: null, fetchedAt: null }), review },
      repo: {
        changes,
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
    });
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.review).toEqual(fetchedReview);
    });
    // when
    act(() => {
      changed();
    });
    // then
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(2);
    });
    expect(review).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledWith('t1');
  });

  test.each<{ name: string; second: Fetched<Review> }>([
    { name: 'reloads the review once when the open PR gets a new head commit', second: atMoved },
    {
      name: 'does not retry a failed review load while the head stays the same',
      second: { data: null, error: 'fetching review: the PR head moved, try again', fetchedAt: null },
    },
  ])('$name', async ({ second }) => {
    // given
    let changed: () => void = vi.fn();
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: openPr, error: null, fetchedAt: null })
      .mockResolvedValue({ data: { ...openPr, headSha: moved }, error: null, fetchedAt: null });
    const review = vi
      .fn<(tabId: string) => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(fetchedReview)
      .mockResolvedValue(second);
    fakeMaple({
      pr: { get, review },
      repo: {
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
    });
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.review).toEqual(fetchedReview);
    });
    // when
    act(() => {
      changed();
    });
    await waitFor(() => {
      expect(result.current.review).toEqual(second);
    });
    act(() => {
      changed();
    });
    // then
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(3);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(review).toHaveBeenCalledTimes(2);
    expect(result.current.review).toEqual(second);
  });

  test.each<{
    name: string;
    first: Fetched<Review>;
    next: PrInfo;
    second: Fetched<Review>;
    trigger: 'none' | 'changed' | 'reload';
    want: boolean;
  }>([
    {
      name: 'the first review loads',
      first: fetchedReview,
      next: openPr,
      second: fetchedReview,
      trigger: 'none',
      want: false,
    },
    {
      name: 'the review reloads at a new commit',
      first: fetchedReview,
      next: { ...openPr, headSha: moved },
      second: atMoved,
      trigger: 'changed',
      want: true,
    },
    {
      name: 'the review reloads at the same commit',
      first: fetchedReview,
      next: openPr,
      second: { ...fetchedReview, fetchedAt: '2026-10-28T12:01:00.000Z' },
      trigger: 'reload',
      want: false,
    },
    {
      name: 'a new PR opens on the same worktree',
      first: fetchedReview,
      next: { ...openPr, number: 8, headSha: moved },
      second: { ...fetchedReview, data: { ...reviewData, number: 8, headSha: moved } },
      trigger: 'changed',
      want: false,
    },
    {
      name: 'the first load failed and a later one loads',
      first: { data: null, error: 'fetching review: offline', fetchedAt: null },
      next: { ...openPr, headSha: moved },
      second: atMoved,
      trigger: 'changed',
      want: false,
    },
  ])('reviewUpdated is $want when $name', async ({ first, next, second, trigger, want }) => {
    // given
    let changed: () => void = vi.fn();
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: openPr, error: null, fetchedAt: null })
      .mockResolvedValue({ data: next, error: null, fetchedAt: null });
    const review = vi
      .fn<(tabId: string) => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second);
    fakeMaple({
      pr: { get, review },
      repo: {
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
    });
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.review).toEqual(first);
    });
    // when
    if (trigger === 'changed') {
      act(() => {
        changed();
      });
    }
    if (trigger === 'reload') {
      act(() => {
        result.current.reloadReview();
      });
    }
    // then
    await waitFor(() => {
      expect(result.current.review).toEqual(trigger === 'none' ? first : second);
    });
    expect(result.current.reviewUpdated).toBe(want);
  });

  test.each([
    { name: 'there is no PR', found: null },
    { name: 'the PR is merged', found: { ...openPr, state: 'MERGED' as const } },
  ])('skips the review when $name', async ({ found }) => {
    // given
    const review = vi.fn<(tabId: string) => Promise<Fetched<Review>>>(() => Promise.resolve(fetchedReview));
    const get = vi.fn(() => Promise.resolve({ data: found, error: null, fetchedAt: null }));
    fakeMaple({ pr: { get, review } });
    // when
    const { result } = renderHook(() => useCardData(tab));
    // then
    await waitFor(() => {
      expect(result.current.pr?.data).toEqual(found);
    });
    expect(review).not.toHaveBeenCalled();
    expect(result.current.review).toBeNull();
  });

  test('hides the old worktree repo, files, changes and PR until the new worktree loads', async () => {
    // given
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let calls = 0;
    const info = vi.fn<(tabId: string) => Promise<RepoInfo | null>>(async () => {
      calls += 1;
      if (calls > 1) {
        await pending;
        return { name: 'b', branch: 'b-1', hasTry: false };
      }
      return { name: 'a', branch: 'a-1', hasTry: false };
    });
    fakeMaple({
      repo: { info, listFiles: () => Promise.resolve(['README.md']) },
      pr: { get: () => Promise.resolve({ data: openPr, error: null, fetchedAt: null }) },
    });
    const { result, rerender } = renderHook(({ t }) => useCardData(t), {
      initialProps: { t: { ...tab, worktreePath: '/wts/a' } },
    });
    await waitFor(() => {
      expect(result.current.repo?.name).toBe('a');
    });
    // when
    rerender({ t: { ...tab, worktreePath: '/wts/b' } });
    // then
    expect(result.current.repo).toBeNull();
    expect(result.current.pr).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.changes).toBeNull();
    // when
    finish();
    // then
    await waitFor(() => {
      expect(result.current.repo?.name).toBe('b');
    });
    expect(result.current.pr?.data).toEqual(openPr);
  });

  test('drops the loaded review when the worktree changes to a PR with the same number', async () => {
    // given
    const reviewA: Fetched<Review> = { ...fetchedReview, data: { ...reviewData, number: 12 } };
    const reviewB: Fetched<Review> = { ...reviewA, data: { ...reviewData, number: 12, headSha: 'd'.repeat(40) } };
    let finishB: (review: Fetched<Review>) => void = () => undefined;
    const review = vi
      .fn<(tabId: string) => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(reviewA)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishB = resolve;
        }),
      );
    const pr12 = { ...openPr, number: 12 };
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr12, error: null, fetchedAt: null }), review } });
    const { result, rerender } = renderHook(({ t }) => useCardData(t), {
      initialProps: { t: { ...tab, worktreePath: '/wts/a' } },
    });
    await waitFor(() => {
      expect(result.current.review).toEqual(reviewA);
    });
    // when
    rerender({ t: { ...tab, worktreePath: '/wts/b' } });
    // then
    expect(result.current.review).toBeNull();
    // when
    act(() => {
      finishB(reviewB);
    });
    // then
    await waitFor(() => {
      expect(result.current.review).toEqual(reviewB);
    });
  });

  test('reloadReview loads the review again', async () => {
    // given
    const later: Fetched<Review> = { ...fetchedReview, data: { ...reviewData, headSha: 'd'.repeat(40) } };
    const review = vi
      .fn<(tabId: string) => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(fetchedReview)
      .mockResolvedValueOnce(later);
    fakeMaple({ pr: { get: () => Promise.resolve({ data: openPr, error: null, fetchedAt: null }), review } });
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.review).toEqual(fetchedReview);
    });
    // when
    act(() => {
      result.current.reloadReview();
    });
    // then
    await waitFor(() => {
      expect(result.current.review).toEqual(later);
    });
  });

  test('reloadingReview stays true until the review settles', async () => {
    // given
    let settle: (review: Fetched<Review>) => void = () => undefined;
    const review = vi
      .fn<(tabId: string) => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(fetchedReview)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      );
    fakeMaple({ pr: { get: () => Promise.resolve({ data: openPr, error: null, fetchedAt: null }), review } });
    const { result } = renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(result.current.reloadingReview).toBe(false);
      expect(result.current.review).toEqual(fetchedReview);
    });
    // when
    act(() => {
      result.current.reloadReview();
    });
    // then
    expect(result.current.reloadingReview).toBe(true);
    // when
    act(() => {
      settle(fetchedReview);
    });
    // then
    await waitFor(() => {
      expect(result.current.reloadingReview).toBe(false);
    });
  });
});
