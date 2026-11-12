import { act, renderHook } from '@testing-library/react';
import { useColumnDrag } from './useColumnDrag';

const KEY = 'test.columns.left';

function container(): { current: HTMLDivElement } {
  const div = document.createElement('div');
  div.getBoundingClientRect = () => ({ left: 100, right: 900, width: 800 }) as DOMRect;
  return { current: div };
}

function renderDrag(ref: { current: HTMLDivElement | null } = container()) {
  return renderHook(() =>
    useColumnDrag(ref, {
      storageKey: KEY,
      initial: 240,
      toSize: (rect, pointer) => pointer.clientX - rect.left,
    }),
  );
}

function pointer(type: string, clientX = 0) {
  act(() => {
    window.dispatchEvent(new PointerEvent(type, { clientX }));
  });
}

describe('useColumnDrag', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  test.each([
    { name: 'nothing saved', saved: null, expected: 240 },
    { name: 'a saved size', saved: '300', expected: 300 },
    { name: 'a saved value that is not a number', saved: 'wide', expected: 240 },
  ])('starts at the initial or saved size with $name', ({ saved, expected }) => {
    // given
    if (saved !== null) {
      localStorage.setItem(KEY, saved);
    }
    // when
    const { result } = renderDrag();
    // then
    expect(result.current.size).toBe(expected);
  });

  test('resizes on pointer move and saves only on pointer up', () => {
    // given
    const { result } = renderDrag();
    act(() => {
      result.current.start(new PointerEvent('pointerdown'));
    });
    // when
    pointer('pointermove', 400);
    // then
    expect(result.current.size).toBe(300);
    expect(localStorage.getItem(KEY)).toBeNull();
    // when
    pointer('pointerup');
    pointer('pointermove', 600);
    // then
    expect(localStorage.getItem(KEY)).toBe('300');
    expect(result.current.size).toBe(300);
  });

  test('a click without a move saves nothing', () => {
    // given
    const { result } = renderDrag();
    act(() => {
      result.current.start(new PointerEvent('pointerdown'));
    });
    // when
    pointer('pointerup');
    // then
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(result.current.size).toBe(240);
  });

  test('reset returns to the initial size and forgets the saved size', () => {
    // given
    localStorage.setItem(KEY, '300');
    const { result } = renderDrag();
    // when
    act(() => {
      result.current.reset();
    });
    // then
    expect(result.current.size).toBe(240);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('ignores a drag before the container mounts', () => {
    // given
    const { result } = renderDrag({ current: null });
    // when
    act(() => {
      result.current.start(new PointerEvent('pointerdown'));
    });
    pointer('pointermove', 400);
    pointer('pointerup');
    // then
    expect(result.current.size).toBe(240);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('works when localStorage throws', () => {
    // given
    const fail = () => {
      throw new Error('using storage: blocked');
    };
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail });
    const { result } = renderDrag();
    act(() => {
      result.current.start(new PointerEvent('pointerdown'));
    });
    // when
    pointer('pointermove', 400);
    pointer('pointerup');
    // then
    expect(result.current.size).toBe(300);
    // when
    act(() => {
      result.current.reset();
    });
    // then
    expect(result.current.size).toBe(240);
  });
});
