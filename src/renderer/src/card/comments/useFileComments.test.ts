import type { DiffLines } from '@shared/types/files/diffLines';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { useFileComments } from './useFileComments';

const comment: ReviewComment = {
  id: 101,
  replyTo: null,
  startLine: null,
  path: 'src/a.ts',
  line: 3,
  author: 'tahardi',
  body: 'why?',
  threadId: null,
  resolved: false,
};

const review: Review = {
  number: 7,
  headSha: 'a'.repeat(40),
  baseSha: 'c'.repeat(40),
  added: 0,
  removed: 0,
  files: [],
  findings: [],
};

const props = {
  tabId: 't1',
  canComment: true,
  review,
  activeFile: 'src/a.ts' as string | null,
  prFetchedAt: null as string | null,
};

describe('useFileComments', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('reads nothing when the tab cannot comment', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([comment]));
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {} }));
    fakeMaple({ pr: { comments, diffLines } });
    // when
    const { result } = renderHook(() => useFileComments({ ...props, canComment: false }));
    await act(() => Promise.resolve());
    // then
    expect(comments).not.toHaveBeenCalled();
    expect(diffLines).not.toHaveBeenCalled();
    expect(result.current.comments).toEqual([]);
    expect(result.current.diff).toBeNull();
  });

  test('reads the review comments and reports each read', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([comment]));
    fakeMaple({ pr: { comments } });
    const onComments = vi.fn();
    // when
    const { result } = renderHook(() => useFileComments({ ...props, onComments }));
    // then
    await waitFor(() => {
      expect(result.current.comments).toEqual([comment]);
    });
    expect(comments).toHaveBeenCalledWith('t1');
    expect(onComments).toHaveBeenCalledWith([comment]);
  });

  test('re-reads the comments when the PR fetch time or the status dot changes', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    fakeMaple({ pr: { comments } });
    const { rerender } = renderHook((p: typeof props) => useFileComments(p), { initialProps: props });
    await waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(1);
    });
    // when
    rerender({ ...props, prFetchedAt: '2026-10-22T12:00:00.000Z' });
    act(() => {
      useMaple.setState({
        statuses: {
          t1: { tabId: 't1', dot: 'idle', sessionAlive: true, exitCode: null, resumeFailed: false, sync: null },
        },
      });
    });
    // then
    await waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(3);
    });
  });

  test('reads the diff ranges at the review commits', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }));
    fakeMaple({ pr: { diffLines } });
    // when
    const { result } = renderHook(() => useFileComments(props));
    // then
    await waitFor(() => {
      expect(result.current.diff).toEqual({ headSha: review.headSha, ranges: { 'src/a.ts': [[1, 10]] } });
    });
    expect(diffLines).toHaveBeenCalledWith('t1', review.baseSha, review.headSha);
  });

  test('re-reads the diff ranges when another file opens', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {} }));
    fakeMaple({ pr: { diffLines } });
    const { rerender } = renderHook((p: typeof props) => useFileComments(p), { initialProps: props });
    await waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(1);
    });
    // when
    rerender({ ...props, activeFile: 'README.md' });
    // then
    await waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(2);
    });
  });

  test('refresh re-reads the comments and the diff ranges', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {} }));
    fakeMaple({ pr: { comments, diffLines } });
    const { result } = renderHook(() => useFileComments(props));
    await waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(1);
      expect(diffLines).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      result.current.refresh();
    });
    // then
    await waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
      expect(diffLines).toHaveBeenCalledTimes(2);
    });
  });

  test('keeps the last comments when a read fails', async () => {
    // given
    const comments = vi
      .fn<() => Promise<ReviewComment[]>>()
      .mockResolvedValueOnce([comment])
      .mockRejectedValue(new Error('listing review comments: offline'));
    fakeMaple({ pr: { comments } });
    const { result } = renderHook(() => useFileComments(props));
    await waitFor(() => {
      expect(result.current.comments).toEqual([comment]);
    });
    // when
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
    });
    await act(() => Promise.resolve());
    // then
    expect(result.current.comments).toEqual([comment]);
  });
});
