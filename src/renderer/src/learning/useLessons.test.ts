import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { lesson } from '@renderer/testing/lessonFixture';
import { useLessons } from './useLessons';

describe('useLessons', () => {
  test('loads the lessons', async () => {
    // given
    fakeMaple({ learning: { list: () => Promise.resolve([lesson('xss')]) } });
    // when
    const { result } = renderHook(() => useLessons());
    // then
    await waitFor(() => {
      expect(result.current).toMatchObject({ lessons: [lesson('xss')], error: null });
    });
  });

  test('reloads when the vault changes', async () => {
    // given
    const changed = { value: (): void => undefined };
    const list = vi.fn(() => Promise.resolve([lesson('xss')]));
    fakeMaple({
      learning: { list },
      vault: {
        onChanged: (cb) => {
          changed.value = cb;
          return vi.fn();
        },
      },
    });
    const { result } = renderHook(() => useLessons());
    await waitFor(() => {
      expect(result.current.lessons).toHaveLength(1);
    });
    list.mockResolvedValue([lesson('xss'), lesson('csrf')]);
    // when
    act(() => {
      changed.value();
    });
    // then
    await waitFor(() => {
      expect(result.current.lessons).toHaveLength(2);
    });
  });

  test('exposes the error when listing fails', async () => {
    // given
    fakeMaple({ learning: { list: () => Promise.reject(new Error('reading lessons: no vaultDir in config')) } });
    // when
    const { result } = renderHook(() => useLessons());
    // then
    await waitFor(() => {
      expect(result.current).toMatchObject({ lessons: [], error: 'reading lessons: no vaultDir in config' });
    });
  });

  test('reload lists the lessons again', async () => {
    // given
    const list = vi.fn(() => Promise.resolve([lesson('xss')]));
    fakeMaple({ learning: { list } });
    const { result } = renderHook(() => useLessons());
    await waitFor(() => {
      expect(result.current.lessons).toHaveLength(1);
    });
    list.mockResolvedValue([lesson('xss'), lesson('csrf')]);
    // when
    act(() => {
      result.current.reload();
    });
    // then
    await waitFor(() => {
      expect(result.current.lessons).toHaveLength(2);
    });
  });

  test('stops listening and ignores a late result after unmount', async () => {
    // given
    let finish: (lessons: LessonSummary[]) => void = () => undefined;
    const list = vi.fn(
      () =>
        new Promise<LessonSummary[]>((resolve) => {
          finish = resolve;
        }),
    );
    const unsubscribe = vi.fn();
    fakeMaple({ learning: { list }, vault: { onChanged: () => unsubscribe } });
    const { result, unmount } = renderHook(() => useLessons());
    // when
    unmount();
    finish([lesson('xss')]);
    await Promise.resolve();
    // then
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.lessons).toEqual([]);
  });
});
