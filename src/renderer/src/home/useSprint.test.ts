import type { Fetched } from '@shared/types/app';
import type { Sprint } from '@shared/types/jira';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '../testing/fakeMaple';
import { SPRINT } from '../testing/sprintFixture';
import { useSprint } from './useSprint';

describe('useSprint', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('keeps old cards and exposes the error', async () => {
    // given
    const stale = { data: SPRINT, error: 'fetching sprint: timed out', fetchedAt: '2026-10-17T14:02:00' };
    fakeMaple({ jira: { sprint: () => Promise.resolve(stale) } });
    // when
    const { result } = renderHook(() => useSprint('DIG'));
    // then
    await waitFor(() => {
      expect(result.current.sprint).toEqual(stale);
    });
  });

  test('asks for the project sprint on mount', async () => {
    // given
    const sprint = vi.fn(() => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }));
    fakeMaple({ jira: { sprint } });
    // when
    renderHook(() => useSprint('DIG'));
    // then
    await waitFor(() => {
      expect(sprint).toHaveBeenCalledWith('DIG');
    });
  });

  test.each([
    {
      trigger: 'after 60 seconds',
      fire: () => {
        vi.advanceTimersByTime(60_000);
      },
    },
    {
      trigger: 'on window focus',
      fire: () => {
        window.dispatchEvent(new Event('focus'));
      },
    },
  ])('refreshes $trigger', ({ fire }) => {
    // given
    vi.useFakeTimers();
    const sprint = vi.fn(() => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }));
    fakeMaple({ jira: { sprint } });
    renderHook(() => useSprint('DIG'));
    // when
    act(fire);
    // then
    expect(sprint).toHaveBeenCalledTimes(2);
  });

  test('refresh asks for the sprint again', async () => {
    // given
    const sprint = vi.fn(() => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }));
    fakeMaple({ jira: { sprint } });
    const { result } = renderHook(() => useSprint('DIG'));
    // when
    act(() => {
      result.current.refresh();
    });
    // then
    await waitFor(() => {
      expect(sprint).toHaveBeenCalledTimes(2);
    });
  });

  test('switching project drops the old sprint and ignores its late reply', async () => {
    // given
    const pending: { key: string; resolve: (s: Fetched<Sprint>) => void }[] = [];
    const reply = async (key: string, name: string) => {
      const index = pending.findIndex((p) => p.key === key);
      const [request] = pending.splice(index, 1);
      await act(async () => {
        request.resolve({ data: { ...SPRINT, name }, error: null, fetchedAt: null });
        await Promise.resolve();
      });
    };
    fakeMaple({
      jira: {
        sprint: (key: string) =>
          new Promise<Fetched<Sprint>>((resolve) => {
            pending.push({ key, resolve });
          }),
      },
    });
    const { result, rerender } = renderHook(({ key }) => useSprint(key), { initialProps: { key: 'DIG' } });
    await reply('DIG', 'DIG Sprint');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    // when
    rerender({ key: 'BEAR' });
    const afterSwitch = result.current.sprint;
    await reply('BEAR', 'BEAR Sprint');
    await reply('DIG', 'late');
    // then
    expect(afterSwitch).toBeNull();
    expect(result.current.sprint?.data?.name).toBe('BEAR Sprint');
  });

  test('stops refreshing after unmount', () => {
    // given
    vi.useFakeTimers();
    const sprint = vi.fn(() => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }));
    fakeMaple({ jira: { sprint } });
    const { unmount } = renderHook(() => useSprint('DIG'));
    // when
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('focus'));
    });
    // then
    expect(sprint).toHaveBeenCalledTimes(1);
  });
});
