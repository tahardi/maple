import { act, renderHook } from '@testing-library/react';
import { useDiffMode } from './useDiffMode';

describe('useDiffMode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('starts in file without a saved mode', () => {
    // given
    // when
    const { result } = renderHook(() => useDiffMode());
    // then
    expect(result.current.mode).toBe('in-file');
  });

  test('reads a saved side by side mode', () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    // when
    const { result } = renderHook(() => useDiffMode());
    // then
    expect(result.current.mode).toBe('side-by-side');
  });

  test('falls back to in file for an unknown saved mode', () => {
    // given
    localStorage.setItem('maple.viewMode', 'sideways');
    // when
    const { result } = renderHook(() => useDiffMode());
    // then
    expect(result.current.mode).toBe('in-file');
  });

  test('choose saves the mode', () => {
    // given
    const { result } = renderHook(() => useDiffMode());
    // when
    act(() => {
      result.current.choose('side-by-side');
    });
    // then
    expect(result.current.mode).toBe('side-by-side');
    expect(localStorage.getItem('maple.viewMode')).toBe('side-by-side');
  });

  test('works when storage throws', () => {
    // given
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('reading storage: blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('writing storage: blocked');
    });
    const { result } = renderHook(() => useDiffMode());
    const first = result.current.mode;
    // when
    act(() => {
      result.current.choose('side-by-side');
    });
    // then
    expect(first).toBe('in-file');
    expect(result.current.mode).toBe('side-by-side');
  });
});
