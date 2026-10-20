import type { Card } from '@shared/types';

export function readyToStart(cards: readonly Card[], openKeys: ReadonlySet<string>): string[] {
  return cards
    .filter(
      (c) =>
        c.status === 'To Do' &&
        c.blockedBy.every((b) => b.status === 'Done') &&
        !c.labels.includes('needs-taylor') &&
        !openKeys.has(c.key),
    )
    .map((c) => c.key);
}
