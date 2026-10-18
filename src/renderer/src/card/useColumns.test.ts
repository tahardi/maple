import { act, renderHook } from '@testing-library/react';
import { useColumns } from './useColumns';

describe('useColumns', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test.each([
    { name: 'nothing saved', saved: null, expected: { left: 240, right: 32 } },
    { name: 'saved widths', saved: '{"left":300,"right":40}', expected: { left: 300, right: 40 } },
    { name: 'invalid JSON', saved: '{nope', expected: { left: 240, right: 32 } },
    { name: 'the wrong shape', saved: '{"left":"wide","right":40}', expected: { left: 240, right: 32 } },
  ])('loads defaults or saved widths with $name', ({ saved, expected }) => {
    // given
    if (saved !== null) {
      localStorage.setItem('maple.columns', saved);
    }
    // when
    const { result } = renderHook(() => useColumns());
    // then
    expect(result.current[0]).toEqual(expected);
  });

  test('saves new widths', () => {
    // given
    const { result } = renderHook(() => useColumns());
    // when
    act(() => {
      result.current[1]({ left: 200, right: 25 });
    });
    // then
    expect(result.current[0]).toEqual({ left: 200, right: 25 });
    expect(localStorage.getItem('maple.columns')).toBe('{"left":200,"right":25}');
  });

  test('works when localStorage throws', () => {
    // given
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('reading storage: blocked');
      },
      setItem: () => {
        throw new Error('writing storage: blocked');
      },
    });
    const { result } = renderHook(() => useColumns());
    // when
    act(() => {
      result.current[1]({ left: 200, right: 25 });
    });
    // then
    expect(result.current[0]).toEqual({ left: 200, right: 25 });
  });
});
