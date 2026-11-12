import { describe, expect, test, vi } from 'vitest';
import type { Card } from '@shared/types/jira/card';
import type { JiraStatus } from '@shared/types/jira/jiraStatus';
import { tapDoneSnapshots } from './tapDoneSnapshots';

function card(status: JiraStatus): Card {
  return {
    key: 'MPL-1',
    summary: 'Card',
    status,
    points: null,
    labels: [],
    blockedBy: [],
    epic: null,
    descriptionMd: '',
    url: 'https://example.atlassian.net/browse/MPL-1',
  };
}

function setup(status: JiraStatus, session: string | null) {
  const getCard = vi.fn<(key: string) => Promise<Card>>((key) => Promise.resolve({ ...card(status), key }));
  const sessionOf = vi.fn<(cardKey: string) => string | null>((key) => (key === 'MPL-1' ? session : 's2'));
  const remove = vi.fn<(sessionId: string) => Promise<void>>(() => Promise.resolve());
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { getCard, sessionOf, remove, logger, tapped: tapDoneSnapshots(getCard, sessionOf, remove, logger) };
}

describe('tapDoneSnapshots', () => {
  test('removes the snapshots of a Done card session', async () => {
    // given
    const { remove, tapped } = setup('Done', 's1');
    // when
    const got = await tapped('MPL-1');
    // then
    expect(remove.mock.calls).toEqual([['s1']]);
    expect(got).toEqual(card('Done'));
  });

  test('removes each session once', async () => {
    // given
    const { remove, tapped } = setup('Done', 's1');
    // when
    await tapped('MPL-1');
    await tapped('MPL-1');
    // then
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test.each([{ status: 'To Do' as const }, { status: 'In Progress' as const }, { status: 'In Review' as const }])(
    'removes nothing for a card in $status',
    async ({ status }) => {
      // given
      const { remove, tapped } = setup(status, 's1');
      // when
      await tapped('MPL-1');
      // then
      expect(remove).not.toHaveBeenCalled();
    },
  );

  test('removes each Done session once', async () => {
    // given
    const { remove, tapped } = setup('Done', 's1');
    // when
    await tapped('MPL-1');
    await tapped('MPL-2');
    await tapped('MPL-2');
    // then
    expect(remove.mock.calls).toEqual([['s1'], ['s2']]);
  });

  test('rejects and removes nothing when the card lookup fails', async () => {
    // given
    const { getCard, sessionOf, remove, tapped } = setup('Done', 's1');
    getCard.mockRejectedValue(new Error('fetching card: Jira returned 500'));
    // when
    const got = tapped('MPL-1');
    // then
    await expect(got).rejects.toThrow('fetching card: Jira returned 500');
    expect(sessionOf).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  test('does not retry a failed removal', async () => {
    // given
    const { remove, tapped } = setup('Done', 's1');
    remove.mockRejectedValue(new Error('boom'));
    // when
    await tapped('MPL-1');
    await tapped('MPL-1');
    // then
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('removes nothing for a Done card with no session', async () => {
    // given
    const { remove, tapped } = setup('Done', null);
    // when
    await tapped('MPL-1');
    // then
    expect(remove).not.toHaveBeenCalled();
  });

  test('logs a failed removal and still returns the card', async () => {
    // given
    const { remove, logger, tapped } = setup('Done', 's1');
    remove.mockRejectedValue(new Error('boom'));
    // when
    const got = await tapped('MPL-1');
    // then
    expect(got).toEqual(card('Done'));
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('vault', 'failed', {
        operation: 'removeSnapshots',
        args: ['s1'],
        error: 'boom',
      });
    });
  });
});
