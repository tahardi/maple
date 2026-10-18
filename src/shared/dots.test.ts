import { describe, expect, test } from 'vitest';
import type { Dot, PrInfo, TabState, TabStatus } from './types';
import { nextDot, projectCounts, type DotInput } from './dots';

const pr = (state: PrInfo['state'], failed: number): PrInfo => ({
  number: 1,
  url: 'https://github.com/o/r/pull/1',
  title: 'PR',
  state,
  deviations: null,
  needsTaylor: null,
  checks: { passed: 3 - failed, failed, pending: 0, total: 3 },
});

describe('nextDot', () => {
  test.each<{ name: string; prev: Dot; input: DotInput; lastInputAt: number; want: Dot }>([
    { name: 'prompt starts work', prev: 'idle', input: { type: 'prompt' }, lastInputAt: 0, want: 'working' },
    { name: 'permission waits', prev: 'working', input: { type: 'permission' }, lastInputAt: 0, want: 'waiting' },
    { name: 'echo stays idle', prev: 'idle', input: { type: 'output', at: 1100 }, lastInputAt: 1000, want: 'idle' },
    {
      name: 'late output works',
      prev: 'idle',
      input: { type: 'output', at: 3000 },
      lastInputAt: 1000,
      want: 'working',
    },
    {
      name: 'output keeps working',
      prev: 'working',
      input: { type: 'output', at: 9000 },
      lastInputAt: 0,
      want: 'working',
    },
    { name: 'input keeps prev', prev: 'waiting', input: { type: 'input', at: 5 }, lastInputAt: 0, want: 'waiting' },
    {
      name: 'planner stop is idle',
      prev: 'working',
      input: { type: 'stop', kind: 'planner', cardStatus: null, pr: null },
      lastInputAt: 0,
      want: 'idle',
    },
    {
      name: 'done card is idle',
      prev: 'working',
      input: { type: 'stop', kind: 'card', cardStatus: 'Done', pr: null },
      lastInputAt: 0,
      want: 'idle',
    },
    {
      name: 'reviewable card is ready',
      prev: 'working',
      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('OPEN', 0) },
      lastInputAt: 0,
      want: 'ready',
    },
    {
      name: 'failing checks wait',
      prev: 'working',
      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('OPEN', 1) },
      lastInputAt: 0,
      want: 'waiting',
    },
    {
      name: 'in progress card waits',
      prev: 'working',
      input: { type: 'stop', kind: 'card', cardStatus: 'In Progress', pr: pr('OPEN', 0) },
      lastInputAt: 0,
      want: 'waiting',
    },
    {
      name: 'in review without a PR waits',
      prev: 'working',
      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: null },
      lastInputAt: 0,
      want: 'waiting',
    },
    {
      name: 'in review with a merged PR waits',
      prev: 'working',
      input: { type: 'stop', kind: 'card', cardStatus: 'In Review', pr: pr('MERGED', 0) },
      lastInputAt: 0,
      want: 'waiting',
    },
  ])('$name', ({ prev, input, lastInputAt, want }) => {
    // given
    const args = [prev, input, lastInputAt] as const;
    // when
    const got = nextDot(...args);
    // then
    expect(got).toBe(want);
  });
});

describe('projectCounts', () => {
  test('counts waiting and ready tabs per project', () => {
    // given
    const tab = (id: string, projectKey: string): TabState => ({
      id,
      projectKey,
      kind: 'card',
      cardKey: `${projectKey}-${id}`,
      sessionId: id,
      worktreePath: null,
    });
    const status = (tabId: string, dot: Dot): TabStatus => ({ tabId, dot, sessionAlive: true, exitCode: null });
    const tabs = [tab('1', 'DIG'), tab('2', 'DIG'), tab('3', 'BEAR')];
    const statuses = [status('1', 'waiting'), status('2', 'ready'), status('3', 'idle')];
    // when
    const got = projectCounts(tabs, statuses);
    // then
    expect(got).toEqual({ DIG: { waiting: 1, ready: 1 }, BEAR: { waiting: 0, ready: 0 } });
  });
});
