import { act, renderHook } from '@testing-library/react';
import { useDoneOpen } from './useDoneOpen';

describe('useDoneOpen', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  test('starts closed', () => {
    // given
    // when
    const { result } = renderHook(() => useDoneOpen('DIG'));
    // then
    expect(result.current.open).toBe(false);
  });

  test('toggle opens it and saves it for that project only', () => {
    // given
    const { result } = renderHook(() => useDoneOpen('DIG'));
    // when
    act(() => {
      result.current.toggle();
    });
    // then
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem('maple.doneOpen.DIG')).toBe('true');
    expect(renderHook(() => useDoneOpen('BEAR')).result.current.open).toBe(false);
  });

  test('a second toggle closes it and saves that', () => {
    // given
    const { result } = renderHook(() => useDoneOpen('DIG'));
    act(() => {
      result.current.toggle();
    });
    // when
    act(() => {
      result.current.toggle();
    });
    // then
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem('maple.doneOpen.DIG')).toBe('false');
  });

  test('reads a saved open state', () => {
    // given
    localStorage.setItem('maple.doneOpen.DIG', 'true');
    // when
    const { result } = renderHook(() => useDoneOpen('DIG'));
    // then
    expect(result.current.open).toBe(true);
  });

  test('a storage error leaves it closed', () => {
    // given
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    // when
    const { result } = renderHook(() => useDoneOpen('DIG'));
    // then
    expect(result.current.open).toBe(false);
    expect(() => {
      act(() => {
        result.current.toggle();
      });
    }).not.toThrow();
  });
});
