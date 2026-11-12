import type { FindingSeverity } from '@shared/types/github/securityFinding';
import type { Review } from '@shared/types/github/review';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '../testing/fakeMaple';
import { useApproveFlow } from './useApproveFlow';

type Props = { worktree: string | null; review: Review | null; unviewed: number };

function reviewAt(headSha: string, severities: readonly FindingSeverity[] = []): Review {
  return {
    number: 13,
    headSha,
    baseSha: 'base',
    added: 1,
    removed: 0,
    files: [],
    findings: severities.map((severity, i) => ({ id: `F${String(i)}`, severity, summary: 'risk', url: '' })),
  };
}

function renderFlow(initialProps: Props) {
  return renderHook(({ worktree, review, unviewed }: Props) => useApproveFlow('t1', worktree, review, unviewed), {
    initialProps,
  });
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

describe('useApproveFlow', () => {
  test.each([
    { name: 'no high findings and every file viewed', severities: [], unviewed: 0, dialog: null },
    {
      name: 'one high finding',
      severities: ['high' as const],
      unviewed: 0,
      dialog: { title: 'Open security findings', body: '1 open high-severity finding. Approve anyway?' },
    },
    {
      name: 'two unviewed files',
      severities: [],
      unviewed: 2,
      dialog: { title: 'Unviewed files', body: '2 changed files not viewed. Approve anyway?' },
    },
  ])('approve with $name asks $dialog', ({ severities, unviewed, dialog }) => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1', severities), unviewed });
    // when
    act(() => {
      result.current.approve();
    });
    // then
    expect(result.current.dialog).toEqual(dialog);
    expect(approve).toHaveBeenCalledTimes(dialog === null ? 1 : 0);
    if (dialog === null) {
      expect(approve).toHaveBeenCalledWith('t1', 'h1');
    }
  });

  test('confirming the findings still asks about unviewed files', () => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1', ['high', 'high']), unviewed: 1 });
    // when
    act(() => {
      result.current.approve();
    });
    // then
    expect(result.current.dialog?.body).toBe('2 open high-severity findings. Approve anyway?');
    // when
    act(() => {
      result.current.confirm();
    });
    // then
    expect(result.current.dialog).toEqual({
      title: 'Unviewed files',
      body: '1 changed file not viewed. Approve anyway?',
    });
    expect(approve).not.toHaveBeenCalled();
    // when
    act(() => {
      result.current.confirm();
    });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).toHaveBeenCalledWith('t1', 'h1');
  });

  test('medium and low findings do not ask', () => {
    // given
    const approve = fakeApprove();
    const { result } = renderFlow({ worktree: '/a', review: reviewAt('h1', ['medium', 'low']), unviewed: 0 });
    // when
    act(() => {
      result.current.approve();
    });
    // then
    expect(result.current.dialog).toBeNull();
    expect(approve).toHaveBeenCalledWith('t1', 'h1');
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
    act(() => {
      result.current.approve();
    });
    // then
    await waitFor(() => {
      expect(result.current.error).toBe('approving PR: offline');
    });
  });

  test('the error hides when the review moves to a new commit', async () => {
    // given
    failingApprove();
    const { result, rerender } = renderFlow({ worktree: '/a', review: reviewAt('h1'), unviewed: 0 });
    act(() => {
      result.current.approve();
    });
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
    act(() => {
      result.current.approve();
    });
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
    act(() => {
      result.current.approve();
    });
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
    act(() => {
      result.current.approve();
    });
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    maple.pr.approve = vi.fn(() => new Promise<void>(() => undefined));
    // when
    act(() => {
      result.current.approve();
    });
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
});
