import { describe, expect, test } from 'vitest';
import type { Dot, TabState, TabStatus } from './types/tabs';
import type { PrInfo } from './types/github';
import { nextDot, projectCounts, type DotInput } from './dots';

const pr = (state: PrInfo['state'], failed: number): PrInfo => ({
  number: 1,
  url: 'https://github.com/o/r/pull/1',
  title: 'PR',
  state,
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  checks: { passed: 3 - failed, failed, pending: 0, total: 3, runs: [] },
});

describe('nextDot', () => {
  test.each<{ name: string; input: DotInput; want: Dot }>([
    { name: 'prompt starts work', input: { type: 'prompt' }, want: 'working' },
    { name: 'permission waits', input: { type: 'permission' }, want: 'waiting' },
    {
      name: 'planner stop is idle',

      input: { type: 'stop', kind: 'planner', cardStatus: null, pr: null },
      want: 'idle',
    },
    {
      name: 'planner stop with a done status is idle',

      input: { type: 'stop', kind: 'planner', cardStatus: 'Done', pr: null },
      want: 'idle',
    },
    {
      name: 'done card is merged',

      input: { type: 'stop', kind: 'card', cardStatus: 'Done', pr: null },
      want: 'merged',
    },
    {
      name: 'done card with a merged PR is merged',

      input: { type: 'stop', kind: 'card', cardStatus: 'Done', pr: pr('MERGED', 0) },
      want: 'merged',
    },
    {
      name: 'done card with failing checks is merged',

      input: { type: 'stop', kind: 'card', cardStatus: 'Done', pr: pr('OPEN', 2) },
      want: 'merged',
    },
    {
      name: 'reviewable card is ready',

      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('OPEN', 0) },
      want: 'ready',
    },
    {
      name: 'failing checks wait',

      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('OPEN', 1) },
      want: 'waiting',
    },
    {
      name: 'to do card waits',

      input: { type: 'stop', kind: 'card', cardStatus: 'To Do', pr: null },
      want: 'waiting',
    },
    {
      name: 'in progress card waits',

      input: { type: 'stop', kind: 'card', cardStatus: 'In Progress', pr: pr('OPEN', 0) },
      want: 'waiting',
    },
    {
      name: 'in review without a PR waits',

      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: null },
      want: 'waiting',
    },
    {
      name: 'in review with a merged PR waits',

      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('MERGED', 0) },
      want: 'waiting',
    },
    {
      name: 'in review with a closed PR waits',

      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('CLOSED', 0) },
      want: 'waiting',
    },
  ])('$name', ({ input, want }) => {
    // given
    const args = [input] as const;
    // when
    const got = nextDot(...args);
    // then
    expect(got).toBe(want);
  });
});

const tab = (id: string, projectKey: string): TabState => ({
  id,
  projectKey,
  kind: 'card',
  cardKey: `${projectKey}-${id}`,
  sessionId: id,
  worktreePath: null,
});
const status = (tabId: string, dot: Dot): TabStatus => ({
  tabId,
  dot,
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
});

describe('projectCounts', () => {
  test('counts waiting and ready tabs per project', () => {
    // given
    const tabs = [tab('1', 'DIG'), tab('2', 'DIG'), tab('3', 'BEAR'), tab('4', 'DIG')];
    const statuses = [status('1', 'waiting'), status('2', 'ready'), status('3', 'idle'), status('4', 'merged')];
    // when
    const got = projectCounts(tabs, statuses);
    // then
    expect(got).toEqual({ DIG: { waiting: 1, ready: 1 }, BEAR: { waiting: 0, ready: 0 } });
  });

  test.each([
    { name: 'a tab with no status', tabs: [tab('1', 'DIG')], statuses: [], want: { DIG: { waiting: 0, ready: 0 } } },
    {
      name: 'a status for a closed tab',
      tabs: [tab('1', 'DIG')],
      statuses: [status('1', 'working'), status('9', 'waiting')],
      want: { DIG: { waiting: 0, ready: 0 } },
    },
    { name: 'no tabs', tabs: [], statuses: [status('9', 'ready')], want: {} },
  ])('counts nothing for $name', ({ tabs, statuses, want }) => {
    // given
    const args = [tabs, statuses] as const;
    // when
    const got = projectCounts(...args);
    // then
    expect(got).toEqual(want);
  });
});
