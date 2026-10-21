import { describe, expect, test } from 'vitest';
import type { Card } from './types';
import { sprintPoints } from './points';

function card(status: Card['status'], points: number | null): Card {
  return {
    key: 'DIG-1',
    summary: 'Summary',
    status,
    points,
    labels: [],
    blockedBy: [],
    descriptionMd: '',
    url: 'https://example.atlassian.net/browse/DIG-1',
  };
}

describe('sprintPoints', () => {
  test.each([
    { name: 'no cards', cards: [], expected: { planned: 0, merged: 0 } },
    {
      name: 'every status counts as planned',
      cards: [card('To Do', 1), card('In Progress', 2), card('In Review', 3), card('Done', 5)],
      expected: { planned: 11, merged: 5 },
    },
    {
      name: 'only Done cards count as merged',
      cards: [card('Done', 3), card('Done', 2), card('In Review', 8)],
      expected: { planned: 13, merged: 5 },
    },
    {
      name: 'null points count as 0',
      cards: [card('To Do', null), card('Done', null), card('Done', 3)],
      expected: { planned: 3, merged: 3 },
    },
    {
      name: 'fractional points',
      cards: [card('To Do', 0.5), card('Done', 2.5)],
      expected: { planned: 3, merged: 2.5 },
    },
  ])('sums $name', ({ cards, expected }) => {
    // given
    const list: readonly Card[] = cards;
    // when
    const points = sprintPoints(list);
    // then
    expect(points).toEqual(expected);
  });
});
