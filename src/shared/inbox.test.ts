import { describe, expect, test } from 'vitest';
import type { Dot, TabState, TabStatus } from './types';
import { inboxItems, type InboxItem } from './inbox';

const card = (id: string, projectKey: string, cardKey: string): TabState => ({
  id,
  projectKey,
  kind: 'card',
  cardKey,
  sessionId: `s-${id}`,
  worktreePath: null,
});
const planner = (id: string, projectKey: string): TabState => ({
  id,
  projectKey,
  kind: 'planner',
  cardKey: null,
  sessionId: `s-${id}`,
  worktreePath: null,
});
const status = (tabId: string, dot: Dot): TabStatus => ({
  tabId,
  dot,
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
});

describe('inboxItems', () => {
  test.each<{
    name: string;
    tabs: TabState[];
    statuses: TabStatus[];
    since: Record<string, number>;
    points: Record<string, number | null>;
    want: InboxItem[];
  }>([
    {
      name: 'leaves out working and idle tabs',
      tabs: [card('t1', 'DIG', 'DIG-1'), card('t2', 'DIG', 'DIG-2')],
      statuses: [status('t1', 'working'), status('t2', 'idle')],
      since: { t1: 1, t2: 2 },
      points: { 'DIG-1': 1, 'DIG-2': 2 },
      want: [],
    },
    {
      name: 'lists waiting and ready tabs from two projects oldest first',
      tabs: [card('t1', 'DIG', 'DIG-1'), card('t2', 'BEAR', 'BEAR-2')],
      statuses: [status('t1', 'waiting'), status('t2', 'ready')],
      since: { t1: 200, t2: 100 },
      points: { 'DIG-1': 1, 'BEAR-2': 3 },
      want: [
        { tabId: 't2', projectKey: 'BEAR', kind: 'card', cardKey: 'BEAR-2', dot: 'ready', since: 100, points: 3 },
        { tabId: 't1', projectKey: 'DIG', kind: 'card', cardKey: 'DIG-1', dot: 'waiting', since: 200, points: 1 },
      ],
    },
    {
      name: 'gives a card missing from points null points',
      tabs: [card('t1', 'DIG', 'DIG-1')],
      statuses: [status('t1', 'ready')],
      since: { t1: 100 },
      points: {},
      want: [
        { tabId: 't1', projectKey: 'DIG', kind: 'card', cardKey: 'DIG-1', dot: 'ready', since: 100, points: null },
      ],
    },
    {
      name: 'includes a waiting planner tab',
      tabs: [planner('p1', 'DIG')],
      statuses: [status('p1', 'waiting')],
      since: { p1: 100 },
      points: {},
      want: [
        { tabId: 'p1', projectKey: 'DIG', kind: 'planner', cardKey: null, dot: 'waiting', since: 100, points: null },
      ],
    },
    {
      name: 'leaves out a tab with no status',
      tabs: [card('t1', 'DIG', 'DIG-1')],
      statuses: [],
      since: {},
      points: { 'DIG-1': 1 },
      want: [],
    },
  ])('$name', ({ tabs, statuses, since, points, want }) => {
    // given
    const args = [tabs, statuses, since, points] as const;
    // when
    const got = inboxItems(...args);
    // then
    expect(got).toEqual(want);
  });
});
