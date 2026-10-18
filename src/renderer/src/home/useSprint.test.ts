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
