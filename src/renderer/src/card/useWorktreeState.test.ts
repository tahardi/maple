import { act, renderHook } from '@testing-library/react';
import { useWorktreeState } from './useWorktreeState';

function renderState(worktree: string | null) {
  return renderHook(({ path }) => useWorktreeState(path, 'initial'), { initialProps: { path: worktree } });
}

describe('useWorktreeState', () => {
  test.each([
    { from: '/a', to: '/a', expected: 'keeps', value: 'changed' },
    { from: '/a', to: '/b', expected: 'resets', value: 'initial' },
    { from: null, to: '/a', expected: 'keeps', value: 'changed' },
    { from: '/a', to: null, expected: 'keeps', value: 'changed' },
  ])('$expected the value when the worktree goes from $from to $to', ({ from, to, value }) => {
    // given
    const { result, rerender } = renderState(from);
    act(() => {
      result.current[1](() => 'changed');
    });
    // when
    rerender({ path: to });
    // then
    expect(result.current[0]).toBe(value);
  });

  test('a write after a switch sticks to the new worktree', () => {
    // given
    const { result, rerender } = renderState('/a');
    act(() => {
      result.current[1](() => 'on a');
    });
    rerender({ path: '/b' });
    // when
    act(() => {
      result.current[1]((now) => `${now} on b`);
    });
    rerender({ path: '/b' });
    // then
    expect(result.current[0]).toBe('initial on b');
    // when
    rerender({ path: '/a' });
    // then
    expect(result.current[0]).toBe('initial');
  });

  test('switches without an extra render', () => {
    // given
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ path }) => {
        renders += 1;
        return useWorktreeState(path, 'initial');
      },
      { initialProps: { path: '/a' } },
    );
    act(() => {
      result.current[1](() => 'changed');
    });
    const before = renders;
    // when
    rerender({ path: '/b' });
    // then
    expect(renders).toBe(before + 1);
    expect(result.current[0]).toBe('initial');
  });
});
