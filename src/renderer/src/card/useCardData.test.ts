import type { TabState } from '@shared/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { useCardData } from './useCardData';

const tab: TabState = {
  id: 't1',
  projectKey: 'BEAR',
  kind: 'card',
  cardKey: 'BEAR-1',
  sessionId: 's1',
  worktreePath: '/tmp/wts/bearclave-bear-1-thing',
};

describe('useCardData', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('refreshes on repo changes and when the tab goes idle', async () => {
    // given
    let changed: () => void = vi.fn();
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({
      repo: {
        changes,
        onChanged: vi.fn((_tabId: string, cb: () => void) => {
          changed = cb;
          return vi.fn();
        }),
      },
    });
    renderHook(() => useCardData(tab));
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      changed();
    });
    act(() => {
      useMaple.getState().setStatus({ tabId: 't1', dot: 'idle', sessionAlive: true, exitCode: null });
    });
    // then
    await waitFor(() => {
      expect(changes).toHaveBeenCalledTimes(3);
    });
  });

  test('finds the card in the sprint and skips the repo without a worktree', async () => {
    // given
    const card = {
      key: 'BEAR-1',
      summary: 'Thing',
      status: 'In Progress' as const,
      points: 1,
      labels: [],
      blockedBy: [],
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/BEAR-1',
    };
    const changes = vi.fn(() => Promise.resolve(null));
    fakeMaple({
      repo: { changes },
      jira: {
        sprint: () =>
          Promise.resolve({
            data: { name: 'S1', startDate: '', endDate: '', cards: [card] },
            error: null,
            fetchedAt: null,
          }),
      },
    });
    // when
    const { result } = renderHook(() => useCardData({ ...tab, worktreePath: null }));
    // then
    await waitFor(() => {
      expect(result.current.card).toEqual(card);
    });
    expect(changes).not.toHaveBeenCalled();
  });
});
