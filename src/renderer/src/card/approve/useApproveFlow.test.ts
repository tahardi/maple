import type { Review } from '@shared/types/github/review';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '../../testing/fakeMaple';
import { useApproveFlow } from './useApproveFlow';

type Props = {
  worktree: string | null;
  review: Review | null;
  unviewed: number;
  undecided?: number;
  blocked?: boolean;
};

function reviewAt(headSha: string): Review {
  return { number: 13, headSha, baseSha: 'base', added: 1, removed: 0, files: [] };
}

function renderFlow(initialProps: Props) {
  return renderHook(
    ({ worktree, review, unviewed, undecided, blocked }: Props) =>
      useApproveFlow('t1', worktree, review, unviewed, undecided ?? 0, blocked ?? false),
    { initialProps },
  );
}

function fakeApprove() {
  const approve = vi.fn<(tabId: string, headSha: string) => Promise<void>>(() => Promise.resolve());
  fakeMaple({ pr: { approve } });
  return approve;
}

function failingApprove() {
  return fakeMaple({
    pr: {
      approve: vi.fn(() =>
        Promise.reject(new Error("Error invoking remote method 'pr:approve': Error: approving PR: offline")),
      ),
    },
  });
}

type Flow = { current: ReturnType<typeof useApproveFlow> };

function approveAndConfirm(result: Flow) {
  act(() => {
    result.current.approve();
  });
  act(() => {
    result.current.confirm();
  });
}

describe('useApproveFlow', () => {
  test.each([
    { name: 'nothing open', undecided: 0, unviewed: 0, body: 'Approves PR #13 and merges it.', danger: false },
    { name: 'two undecided findings', undecided: 2, unviewed: 0, body: '2 findings not decided.', danger: true },
    { name: 'two unviewed files', undecided: 0, unviewed: 2, body: '2 changed files not viewed.', danger: true },
  ])('approve with $name always asks first', ({ undecided, unviewed, body, danger }) => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed, undecided });
    // when
    act(() => {
      result.current.approve();
    });
    // then
    expect(result.current.dialog).toEqual({ title: 'Approve & merge PR #13?', body, danger });
    expect(approve).not.toHaveBeenCalled();
  });

  test('confirm merges with undecided findings', () => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0, undecided: 1 });
    act(() => {
      result.current.approve();
    });
    expect(result.current.dialog?.body).toBe('1 finding not decided.');
    // when
    act(() => {
      result.current.confirm();
    });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).toHaveBeenCalledWith('t1', 'h1');
  });

  test('confirm approves the reviewed head and closes the dialog', () => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 1 });
    // when
    approveAndConfirm(result);
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).toHaveBeenCalledWith('t1', 'h1');
  });

  test('the dialog closes and confirm approves nothing once a blocker appears', () => {
    // given
    const approve = fakeApprove();
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    act(() => {
      result.current.approve();
    });
    // when
    rerender({ worktree: '/a', review: reviewAt('h1'), unviewed: 0, blocked: true });
    act(() => {
      result.current.confirm();
    });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  test('the dialog stays closed when the blocker clears', () => {
    // given
    fakeApprove();
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    act(() => {
      result.current.approve();
    });
    rerender({ worktree: '/a', review: reviewAt('h1'), unviewed: 0, blocked: true });
    // when
    rerender({ worktree: '/a', review: reviewAt('h1'), unviewed: 0, blocked: false });
    // then
    expect(result.current.dialog).toBeNull();
  });

  test('cancel closes the dialog without approving', () => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 1 });
    act(() => {
      result.current.approve();
    });
    // when
    act(() => {
      result.current.cancel();
    });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  test('a failed approve shows its message without the IPC prefix', async () => {
    // given
    failingApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    // when
    approveAndConfirm(result);
    // then
    await waitFor(() => {
      expect(result.current.error).toBe('approving PR: offline');
    });
  });

  test('the error hides when the review moves to a new commit', async () => {
    // given
    failingApprove();
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    approveAndConfirm(result);
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    // when
    rerender({ worktree: '/a', review: reviewAt('h2'), unviewed: 0 });
    // then
    expect(result.current.error).toBeNull();
  });

  test('the error clears when the worktree switches', async () => {
    // given
    failingApprove();
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    approveAndConfirm(result);
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    // when
    rerender({ worktree: '/b', review: reviewAt('h1'), unviewed: 0 });
    // then
    expect(result.current.error).toBeNull();
  });

  test('clearError removes the error', async () => {
    // given
    failingApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    approveAndConfirm(result);
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    // when
    act(() => {
      result.current.clearError();
    });
    // then
    expect(result.current.error).toBeNull();
  });

  test('the dialog closes when the review moves to a new commit', () => {
    // given
    const approve = fakeApprove();
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 1 });
    act(() => {
      result.current.approve();
    });
    // when
    rerender({ worktree: '/a', review: reviewAt('h2'), unviewed: 1 });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  test('approving again clears the last error', async () => {
    // given
    const maple = failingApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    approveAndConfirm(result);
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    maple.pr.approve = vi.fn(() => new Promise<void>(() => undefined));
    // when
    approveAndConfirm(result);
    // then
    expect(result.current.error).toBeNull();
  });

  test('approve does nothing without a review', () => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: null, unviewed: 2 });
    // when
    act(() => {
      result.current.approve();
    });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'resolves', outcome: () => Promise.resolve() },
    { name: 'rejects', outcome: () => Promise.reject(new Error('approving PR: offline')) },
  ])('approving is true until the approve call $name', async ({ outcome }) => {
    // given
    let settle: () => void = () => undefined;
    fakeMaple({
      pr: {
        approve: vi.fn(
          () =>
            new Promise<void>((resolve, reject) => {
              settle = () => {
                outcome().then(resolve, reject);
              };
            }),
        ),
      },
    });
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    // when
    approveAndConfirm(result);
    // then
    expect(result.current.approving).toBe(true);
    // when
    act(() => {
      settle();
    });
    // then
    await waitFor(() => {
      expect(result.current.approving).toBe(false);
    });
  });

  test('approving stays with the worktree being merged', () => {
    // given
    fakeMaple({ pr: { approve: vi.fn(() => new Promise<void>(() => undefined)) } });
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    approveAndConfirm(result);
    // when
    rerender({ worktree: '/b', review: reviewAt('h1'), unviewed: 0 });
    // then
    expect(result.current.approving).toBe(false);
    // when
    rerender({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    // then
    expect(result.current.approving).toBe(true);
  });

  test('a merge finishing in one worktree leaves another worktree approving', async () => {
    // given
    const settle = new Map<string, () => void>();
    fakeMaple({
      pr: {
        approve: vi.fn(
          (_tabId: string, headSha: string) =>
            new Promise<void>((resolve) => {
              settle.set(headSha, resolve);
            }),
        ),
      },
    });
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('ha'), unviewed: 0 });
    approveAndConfirm(result);
    rerender({ worktree: '/b', review: reviewAt('hb'), unviewed: 0 });
    approveAndConfirm(result);
    // when
    await act(async () => {
      settle.get('ha')?.();
      await Promise.resolve();
    });
    // then
    expect(result.current.approving).toBe(true);
  });
});
