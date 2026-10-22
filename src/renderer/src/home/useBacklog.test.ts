import type { BacklogGroup } from '@shared/types/jira';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '../testing/fakeMaple';
import { SPRINT } from '../testing/sprintFixture';
import { useBacklog } from './useBacklog';

describe('useBacklog', () => {
  test('keeps old groups and exposes the error', async () => {
    // given
    const groups: BacklogGroup[] = [{ epic: null, cards: SPRINT.cards }];
    const stale = { data: groups, error: 'fetching backlog: timed out', fetchedAt: '2026-10-17T14:02:00' };
    fakeMaple({ jira: { backlog: () => Promise.resolve(stale) } });
    // when
    const { result } = renderHook(() => useBacklog('DIG'));
    // then
    await waitFor(() => {
      expect(result.current.backlog).toEqual(stale);
    });
  });

  test('refresh asks for the backlog again', async () => {
    // given
    const backlog = vi.fn(() => Promise.resolve({ data: [], error: null, fetchedAt: null }));
    fakeMaple({ jira: { backlog } });
    const { result } = renderHook(() => useBacklog('DIG'));
    // when
    act(() => {
      result.current.refresh();
    });
    // then
    await waitFor(() => {
      expect(backlog).toHaveBeenCalledTimes(2);
    });
  });
});
