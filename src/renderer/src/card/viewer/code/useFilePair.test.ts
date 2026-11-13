import type { FilePair } from '@shared/types/files/filePair';
import type { Review } from '@shared/types/github/review';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { useFilePair } from './useFilePair';

const noScroller = { current: null };

const pair: FilePair = { kind: 'text', path: 'src/a.ts', current: 'new\n', base: 'old\n' };

const review: Review = {
  number: 7,
  headSha: 'a'.repeat(40),
  baseSha: 'c'.repeat(40),
  added: 0,
  removed: 0,
  files: [{ path: 'src/a.ts', status: 'M', oldPath: null, stamp: 'f'.repeat(40) }],
};

describe('useFilePair', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ activeTabId: 't1' });
  });

  test('reads a worktree file without a review', async () => {
    // given
    const readFile = vi.fn(() => Promise.resolve(pair));
    fakeMaple({ repo: { readFile } });
    // when
    const { result } = renderHook(() => useFilePair('t1', 'src/a.ts', null, noScroller));
    // then
    await waitFor(() => {
      expect(result.current.pair).toEqual(pair);
    });
    expect(readFile).toHaveBeenCalledWith('t1', 'src/a.ts');
  });

  test('reads the file from GitHub at the review commits', async () => {
    // given
    const prRead = vi.fn(() => Promise.resolve(pair));
    const repoRead = vi.fn(() => Promise.resolve(pair));
    fakeMaple({ repo: { readFile: repoRead }, pr: { readFile: prRead } });
    // when
    const { result } = renderHook(() => useFilePair('t1', 'src/a.ts', review, noScroller));
    // then
    await waitFor(() => {
      expect(result.current.pair).toEqual(pair);
    });
    expect(prRead).toHaveBeenCalledWith('t1', 'src/a.ts', null, review.baseSha, review.headSha);
    expect(repoRead).not.toHaveBeenCalled();
  });

  test('reports why a file from GitHub could not be read', async () => {
    // given
    fakeMaple({
      pr: {
        readFile: () =>
          Promise.reject(new Error("Error invoking remote method 'pr:readFile': Error: reading src/a.ts: not found")),
      },
    });
    // when
    const { result } = renderHook(() => useFilePair('t1', 'src/a.ts', review, noScroller));
    // then
    await waitFor(() => {
      expect(result.current.readError).toEqual({ path: 'src/a.ts', message: 'reading src/a.ts: not found' });
    });
    expect(result.current.pair).toBeNull();
  });

  test('re-reads the worktree file when the repo changes and keeps the scroll position', async () => {
    // given
    let changed: () => void = () => undefined;
    let current = 'one\n';
    fakeMaple({
      repo: {
        readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current, base: null }),
        onChanged: (_tabId, cb) => {
          changed = cb;
          return () => undefined;
        },
      },
    });
    const setScrollTop = vi.fn();
    const scroller = { current: { getScrollTop: () => 120, setScrollTop } as unknown as editor.ICodeEditor };
    const { result } = renderHook(() => useFilePair('t1', 'src/a.ts', null, scroller));
    await waitFor(() => {
      expect(result.current.pair).not.toBeNull();
    });
    // when
    current = 'two\n';
    act(() => {
      changed();
    });
    // then
    await waitFor(() => {
      expect(result.current.pair).toEqual({ kind: 'text', path: 'src/a.ts', current: 'two\n', base: null });
    });
    expect(setScrollTop).toHaveBeenCalledWith(120);
  });

  test('ignores a read that finishes after the path changes', async () => {
    // given
    let finishFirst: (next: FilePair) => void = () => undefined;
    fakeMaple({
      repo: {
        readFile: (_tabId, path) =>
          path === 'a.ts'
            ? new Promise((resolve) => {
                finishFirst = resolve;
              })
            : Promise.resolve({ kind: 'text', path, current: 'b\n', base: 'b\n' }),
      },
    });
    const { result, rerender } = renderHook(({ path }) => useFilePair('t1', path, null, noScroller), {
      initialProps: { path: 'a.ts' },
    });
    rerender({ path: 'b.ts' });
    await waitFor(() => {
      expect(result.current.pair?.path).toBe('b.ts');
    });
    // when
    await act(async () => {
      finishFirst({ kind: 'text', path: 'a.ts', current: 'a\n', base: 'a\n' });
      await Promise.resolve();
    });
    // then
    expect(result.current.pair?.path).toBe('b.ts');
  });

  test('stops listening for repo changes on unmount', () => {
    // given
    const stop = vi.fn();
    fakeMaple({ repo: { onChanged: () => stop } });
    const { unmount } = renderHook(() => useFilePair('t1', 'a.png', null, noScroller));
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalledOnce();
  });
});
