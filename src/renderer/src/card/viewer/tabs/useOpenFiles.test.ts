import { act, renderHook } from '@testing-library/react';
import { CARD_DESCRIPTION } from './cardDescription';
import { PR_DESCRIPTION } from './prDescription';
import { useOpenFiles } from './useOpenFiles';

type Props = { path: string | null; pr: boolean; card: boolean };

function renderFiles(initialProps: Props) {
  return renderHook(({ path, pr, card }: Props) => useOpenFiles(path, { pr, card }), { initialProps });
}

describe('useOpenFiles', () => {
  test.each([
    { name: 'a PR', pr: true, card: false, expected: [PR_DESCRIPTION], active: PR_DESCRIPTION },
    { name: 'a card without a PR', pr: false, card: true, expected: [CARD_DESCRIPTION], active: CARD_DESCRIPTION },
    { name: 'neither', pr: false, card: false, expected: [], active: null },
  ])('opens and selects $expected for $name', ({ pr, card, expected, active }) => {
    // given
    // when
    const { result } = renderFiles({ path: '/a', pr, card });
    // then
    expect(result.current.files).toEqual(expected);
    expect(result.current.activeFile).toBe(active);
  });

  test('opens the description without an extra render', () => {
    // given
    let renders = 0;
    // when
    renderHook(() => {
      renders += 1;
      return useOpenFiles('/a', { pr: true, card: false });
    });
    // then
    expect(renders).toBe(1);
  });

  test('keeps a closed description closed when the data reloads', () => {
    // given
    const { result, rerender } = renderFiles({ path: '/a', pr: true, card: false });
    act(() => {
      result.current.close([PR_DESCRIPTION]);
    });
    // when
    rerender({ path: '/a', pr: true, card: false });
    // then
    expect(result.current.files).toEqual([]);
    expect(result.current.activeFile).toBeNull();
  });

  test('keeps a file opened before the PR active when the PR appears', () => {
    // given
    const { result, rerender } = renderFiles({ path: '/a', pr: false, card: false });
    act(() => {
      result.current.open('a.ts');
    });
    // when
    rerender({ path: '/a', pr: true, card: false });
    // then
    expect(result.current.files).toEqual([PR_DESCRIPTION, 'a.ts']);
    expect(result.current.activeFile).toBe('a.ts');
    expect(result.current.preview).toBe('a.ts');
  });

  test('switching worktrees closes every file and reopens the PR description', () => {
    // given
    const { result, rerender } = renderFiles({ path: '/a', pr: true, card: false });
    act(() => {
      result.current.open('a.ts', 3, true);
    });
    // when
    rerender({ path: '/b', pr: true, card: false });
    // then
    expect(result.current.files).toEqual([PR_DESCRIPTION]);
    expect(result.current.activeFile).toBe(PR_DESCRIPTION);
    expect(result.current.line).toBeNull();
  });

  test('the first worktree appearing keeps the open files', () => {
    // given
    const { result, rerender } = renderFiles({ path: null, pr: false, card: false });
    act(() => {
      result.current.open('a.ts', null, true);
    });
    // when
    rerender({ path: '/a', pr: false, card: false });
    // then
    expect(result.current.files).toEqual(['a.ts']);
    expect(result.current.activeFile).toBe('a.ts');
  });

  test('closing the active file selects the last file left', () => {
    // given
    const { result } = renderFiles({ path: '/a', pr: false, card: false });
    act(() => {
      result.current.open('a.ts', null, true);
      result.current.open('b.ts', null, true);
      result.current.open('c.ts', null, true);
      result.current.activate('b.ts');
    });
    // when
    act(() => {
      result.current.close(['b.ts']);
    });
    // then
    expect(result.current.files).toEqual(['a.ts', 'c.ts']);
    expect(result.current.activeFile).toBe('c.ts');
  });

  test('opening at a line keeps the line until another file is activated', () => {
    // given
    const { result, rerender } = renderFiles({ path: '/a', pr: false, card: false });
    act(() => {
      result.current.open('a.ts', 12);
    });
    rerender({ path: '/a', pr: false, card: false });
    // then
    expect(result.current.line).toBe(12);
    // when
    act(() => {
      result.current.pin('a.ts');
    });
    // then
    expect(result.current.line).toBe(12);
    expect(result.current.preview).toBeNull();
    // when
    act(() => {
      result.current.activate('b.ts');
    });
    // then
    expect(result.current.line).toBeNull();
  });
});
