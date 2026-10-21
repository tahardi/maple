import type { Card } from './types';

export function sprintPoints(cards: readonly Card[]): { planned: number; merged: number } {
  let planned = 0;
  let merged = 0;
  for (const card of cards) {
    const points = card.points ?? 0;
    planned += points;
    if (card.status === 'Done') {
      merged += points;
    }
  }
  return { planned, merged };
}
