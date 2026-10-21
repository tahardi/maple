import type { Fetched, Sprint } from '@shared/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { SPRINT } from '../testing/sprintFixture';
import { usePlannedPoints } from './usePlannedPoints';

const replies: Record<string, Fetched<Sprint>> = {
  BEAR: { data: SPRINT, error: null, fetchedAt: null },
  DIG: { data: null, error: null, fetchedAt: null },
};

describe('usePlannedPoints', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ config: FAKE_CONFIG });
  });

  test('loads every project sprint and returns its points', async () => {
    // given
    const sprint = vi.fn((key: string) => Promise.resolve(replies[key]));
    fakeMaple({ jira: { sprint } });
    // when
    const { result } = renderHook(() => usePlannedPoints());
    // then
    await waitFor(() => {
      expect(result.current.rows).toEqual([
        { projectKey: 'BEAR', name: 'Bearclave', planned: 12, merged: 3 },
        { projectKey: 'DIG', name: 'Dig Days', planned: 0, merged: 0 },
      ]);
    });
    expect(sprint).toHaveBeenCalledTimes(2);
  });

  test('reloads on window focus', async () => {
    // given
    const sprint = vi.fn((key: string) => Promise.resolve(replies[key]));
    fakeMaple({ jira: { sprint } });
    const { result } = renderHook(() => usePlannedPoints());
    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });
    // when
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    // then
    expect(sprint).toHaveBeenCalledTimes(4);
  });

  test('stops reloading after unmount', () => {
    // given
    const sprint = vi.fn((key: string) => Promise.resolve(replies[key]));
    fakeMaple({ jira: { sprint } });
    const { unmount } = renderHook(() => usePlannedPoints());
    // when
    unmount();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    // then
    expect(sprint).toHaveBeenCalledTimes(2);
  });

  test('returns no rows before the config loads', () => {
    // given
    useMaple.setState({ config: null });
    const sprint = vi.fn((key: string) => Promise.resolve(replies[key]));
    fakeMaple({ jira: { sprint } });
    // when
    const { result } = renderHook(() => usePlannedPoints());
    // then
    expect(result.current.rows).toEqual([]);
    expect(sprint).not.toHaveBeenCalled();
  });

  test('refresh loads every project sprint again', async () => {
    // given
    const sprint = vi.fn((key: string) => Promise.resolve(replies[key]));
    fakeMaple({ jira: { sprint } });
    const { result } = renderHook(() => usePlannedPoints());
    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });
    // when
    act(() => {
      result.current.refresh();
    });
    // then
    await waitFor(() => {
      expect(sprint).toHaveBeenCalledTimes(4);
    });
  });

  test('loads the new projects after a config reload', async () => {
    // given
    const sprint = vi.fn((key: string) => Promise.resolve(replies[key] ?? replies.BEAR));
    fakeMaple({ jira: { sprint } });
    const { result } = renderHook(() => usePlannedPoints());
    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });
    // when
    act(() => {
      useMaple.setState({
        config: {
          ...FAKE_CONFIG,
          data: FAKE_CONFIG.data && {
            ...FAKE_CONFIG.data,
            projects: [{ name: 'Halo', jiraKey: 'HALO', jiraBoardId: 3, plannerDir: '/tmp/planner/halo' }],
          },
        },
      });
    });
    // then
    await waitFor(() => {
      expect(result.current.rows).toEqual([{ projectKey: 'HALO', name: 'Halo', planned: 12, merged: 3 }]);
    });
  });

  test('counts stale cards when Jira is unreachable', async () => {
    // given
    const stale = { data: SPRINT, error: 'fetching sprint: timed out', fetchedAt: '2026-10-17T14:02:00' };
    fakeMaple({ jira: { sprint: () => Promise.resolve(stale) } });
    // when
    const { result } = renderHook(() => usePlannedPoints());
    // then
    await waitFor(() => {
      expect(result.current.rows[0]).toEqual({ projectKey: 'BEAR', name: 'Bearclave', planned: 12, merged: 3 });
    });
  });
});
