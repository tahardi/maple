import type { FileChange } from '@shared/types';
import { act, renderHook } from '@testing-library/react';
import { useViewed } from './useViewed';

const file = (path: string, stamp: string | null): FileChange => ({ path, status: 'M', oldPath: null, stamp });

describe('useViewed', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test('toggling a file marks it viewed and saves it for the card', () => {
    // given
    const files = [file('a.ts', '3:100'), file('b.ts', '4:200')];
    const { result } = renderHook(() => useViewed('MPL-1', files));
    // when
    act(() => {
      result.current.toggle('a.ts');
    });
    // then
    expect([...result.current.viewed]).toEqual(['a.ts']);
    expect(JSON.parse(localStorage.getItem('maple.viewed.MPL-1') ?? 'null')).toEqual({ 'a.ts': '3:100' });
    expect(localStorage.getItem('maple.viewed.MPL-2')).toBeNull();
  });

  test('toggling a file keeps the other saved checks', () => {
    // given
    localStorage.setItem('maple.viewed.MPL-1', '{"a.ts":"3:100","old.ts":"1:1"}');
    const files = [file('a.ts', '3:100'), file('b.ts', '4:200')];
    const { result } = renderHook(() => useViewed('MPL-1', files));
    // when
    act(() => {
      result.current.toggle('b.ts');
    });
    // then
    expect(JSON.parse(localStorage.getItem('maple.viewed.MPL-1') ?? 'null')).toEqual({
      'a.ts': '3:100',
      'old.ts': '1:1',
      'b.ts': '4:200',
    });
  });

  test('checking a changed file again saves its new stamp', () => {
    // given
    const { result, rerender } = renderHook(({ files }) => useViewed('MPL-1', files), {
      initialProps: { files: [file('a.ts', '3:100')] },
    });
    act(() => {
      result.current.toggle('a.ts');
    });
    rerender({ files: [file('a.ts', '5:300')] });
    // when
    act(() => {
      result.current.toggle('a.ts');
    });
    // then
    expect(result.current.viewed.has('a.ts')).toBe(true);
    expect(JSON.parse(localStorage.getItem('maple.viewed.MPL-1') ?? 'null')).toEqual({ 'a.ts': '5:300' });
  });

  test('toggling a viewed file unviews it', () => {
    // given
    const files = [file('a.ts', '3:100')];
    const { result } = renderHook(() => useViewed('MPL-1', files));
    act(() => {
      result.current.toggle('a.ts');
    });
    // when
    act(() => {
      result.current.toggle('a.ts');
    });
    // then
    expect(result.current.viewed.size).toBe(0);
    expect(localStorage.getItem('maple.viewed.MPL-1')).toBe('{}');
  });

  test('a viewed file is unviewed once its stamp changes', () => {
    // given
    const { result, rerender } = renderHook(({ files }) => useViewed('MPL-1', files), {
      initialProps: { files: [file('a.ts', '3:100')] },
    });
    act(() => {
      result.current.toggle('a.ts');
    });
    // when
    rerender({ files: [file('a.ts', '5:300')] });
    // then
    expect(result.current.viewed.has('a.ts')).toBe(false);
  });

  test('a deleted file can be viewed', () => {
    // given
    const files = [file('gone.ts', null)];
    const { result } = renderHook(() => useViewed('MPL-1', files));
    // when
    act(() => {
      result.current.toggle('gone.ts');
    });
    // then
    expect(result.current.viewed.has('gone.ts')).toBe(true);
  });

  test.each([
    { name: 'saved checks', saved: '{"a.ts":"3:100","b.ts":"old"}', expected: ['a.ts'] },
    { name: 'invalid JSON', saved: '{nope', expected: [] },
    { name: 'the wrong shape', saved: '["a.ts"]', expected: [] },
    { name: 'bad values dropped', saved: '{"a.ts":5,"gone.ts":null}', expected: ['gone.ts'] },
    { name: 'checks for another card', saved: null, expected: [] },
  ])('reads saved checks on mount with $name', ({ saved, expected }) => {
    // given
    if (saved !== null) {
      localStorage.setItem('maple.viewed.MPL-1', saved);
    }
    localStorage.setItem('maple.viewed.MPL-2', '{"a.ts":"3:100"}');
    const files = [file('a.ts', '3:100'), file('b.ts', '4:200'), file('gone.ts', null)];
    // when
    const { result } = renderHook(() => useViewed('MPL-1', files));
    // then
    expect([...result.current.viewed]).toEqual(expected);
  });

  test('works when storage throws', () => {
    // given
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('reading storage: blocked');
      },
      setItem: () => {
        throw new Error('writing storage: blocked');
      },
    });
    const { result } = renderHook(() => useViewed('MPL-1', [file('a.ts', '3:100')]));
    // when
    act(() => {
      result.current.toggle('a.ts');
    });
    // then
    expect(result.current.viewed.has('a.ts')).toBe(true);
  });
});
