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
  const getCard = vi.fn<(key: string) => Promise<Card>>(() => Promise.resolve(card(status)));
  const sessionOf = vi.fn<(cardKey: string) => string | null>(() => session);
  const remove = vi.fn<(sessionId: string) => Promise<void>>(() => Promise.resolve());
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { remove, logger, tapped: tapDoneSnapshots(getCard, sessionOf, remove, logger) };
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
