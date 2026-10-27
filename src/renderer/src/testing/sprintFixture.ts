import type { Card, Sprint } from '@shared/types/jira';

export function card(key: string, status: Card['status'], extra: Partial<Card> = {}): Card {
  return {
    key,
    summary: `Summary of ${key}`,
    status,
    points: 3,
    labels: ['parallelizable'],
    blockedBy: [],
    epic: null,
    descriptionMd: `**Goal:** do ${key}`,
    url: `https://example.atlassian.net/browse/${key}`,
    ...extra,
  };
}

export const SPRINT: Sprint = {
  id: 12,
  name: 'DIG Sprint 3',
  startDate: '2026-10-12T12:00:00.000Z',
  endDate: '2026-10-25T12:00:00.000Z',
  cards: [
    card('DIG-41', 'To Do', { blockedBy: [{ key: 'DIG-44', status: 'In Progress' }] }),
    card('DIG-44', 'In Progress'),
    card('DIG-45', 'In Review', { blockedBy: [{ key: 'DIG-40', status: 'Done' }] }),
    card('DIG-40', 'Done'),
    card('DIG-39', 'Done', { points: null, labels: [] }),
  ],
};
