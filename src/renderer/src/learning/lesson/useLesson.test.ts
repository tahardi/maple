import type { Lesson } from '@shared/types/learning/lesson';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { fullLesson } from '@renderer/testing/fullLessonFixture';
import { useLesson } from './useLesson';

const PATH = 'Learning/Security/xss.md';

describe('useLesson', () => {
  test('loads the lesson', async () => {
    // given
    const read = vi.fn(() => Promise.resolve(fullLesson('xss')));
    fakeMaple({ learning: { read } });
    // when
    const { result } = renderHook(() => useLesson(PATH));
    // then
    await waitFor(() => {
      expect(result.current).toMatchObject({ data: fullLesson('xss'), error: null });
    });
    expect(read).toHaveBeenCalledWith(PATH);
  });

  test('reloads when the vault changes', async () => {
    // given
    const changed = { value: (): void => undefined };
    const read = vi.fn<(path: string) => Promise<Lesson>>(() => Promise.resolve(fullLesson('xss')));
    fakeMaple({
      learning: { read },
      vault: {
        onChanged: (cb) => {
          changed.value = cb;
          return vi.fn();
        },
      },
    });
    const { result } = renderHook(() => useLesson(PATH));
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    read.mockResolvedValue(fullLesson('xss', { attack: 'Changed.' }));
    // when
    act(() => {
      changed.value();
    });
    // then
    await waitFor(() => {
      expect(result.current.data?.attack).toBe('Changed.');
    });
  });

  test('keeps the lesson and shows the error when a reload fails', async () => {
    // given
    const changed = { value: (): void => undefined };
    const read = vi
      .fn<(path: string) => Promise<Lesson>>()
      .mockResolvedValueOnce(fullLesson('xss'))
      .mockRejectedValueOnce(new Error('reading lesson: x is not a lesson note'));
    fakeMaple({
      learning: { read },
      vault: {
        onChanged: (cb) => {
          changed.value = cb;
          return vi.fn();
        },
      },
    });
    const { result } = renderHook(() => useLesson(PATH));
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    // when
    act(() => {
      changed.value();
    });
    // then
    await waitFor(() => {
      expect(result.current.error).toBe('reading lesson: x is not a lesson note');
    });
    expect(result.current.data).toEqual(fullLesson('xss'));
  });
});
