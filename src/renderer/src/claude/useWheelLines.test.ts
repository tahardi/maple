import { act, renderHook } from '@testing-library/react';
import { useWheelLines } from './useWheelLines';

describe('useWheelLines', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test.each([
    { name: 'nothing saved', saved: null, expected: 3 },
    { name: 'a saved speed', saved: '7', expected: 7 },
    { name: 'a speed that is not a number', saved: 'fast', expected: 3 },
    { name: 'a speed below 1', saved: '0', expected: 3 },
    { name: 'a speed above 20', saved: '21', expected: 3 },
    { name: 'a fractional speed', saved: '2.5', expected: 3 },
  ])('loads the default or the saved speed with $name', ({ saved, expected }) => {
    // given
    if (saved !== null) {
      localStorage.setItem('maple.wheelLines', saved);
    }
    // when
    const { result } = renderHook(() => useWheelLines());
    // then
    expect(result.current[0]).toBe(expected);
  });

  test('saves a new speed', () => {
    // given
    const { result } = renderHook(() => useWheelLines());
    // when
    act(() => {
      result.current[1](5);
    });
    // then
    expect(result.current[0]).toBe(5);
    expect(localStorage.getItem('maple.wheelLines')).toBe('5');
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
    const { result } = renderHook(() => useWheelLines());
    // when
    act(() => {
      result.current[1](5);
    });
    // then
    expect(result.current[0]).toBe(5);
  });
});
