import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import type { Card, PrInfo, TabState, TabStatus } from '@shared/types';
import type { SessionManager } from './sessions';
import { StatusEngine } from './status';

const cardTab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-44',
  sessionId: 's1',
  worktreePath: '/wts/dig-44',
};

const card: Card = {
  key: 'DIG-44',
  summary: 'Card',
  status: 'In Review',
  points: 1,
  labels: [],
  blockedBy: [],
  descriptionMd: '',
  url: 'https://example.atlassian.net/browse/DIG-44',
};

const openPr: PrInfo = {
  number: 3,
  url: 'https://github.com/o/r/pull/3',
  title: 'PR',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  checks: { passed: 2, failed: 0, pending: 0, total: 2 },
};

type Overrides = {
  tab?: TabState | null;
  getCard?: () => Promise<Card>;
  prFor?: (worktree: string) => Promise<PrInfo | null>;
};

function setup(overrides: Overrides = {}) {
  const tab = overrides.tab === undefined ? cardTab : overrides.tab;
  const sessions = Object.assign(new EventEmitter(), { get: vi.fn(() => tab) });
  const getCard = vi.fn(overrides.getCard ?? (() => Promise.resolve(card)));
  const prFor = vi.fn(overrides.prFor ?? (() => Promise.resolve(openPr)));
  let now = 0;
  const engine = new StatusEngine({
    sessions: sessions as unknown as SessionManager,
    getCard,
    prFor,
    now: () => now,
  });
  const emitted: TabStatus[] = [];
  engine.on('status', (s) => {
    emitted.push(s);
  });
  const tick = (ms: number) => {
    now += ms;
  };
  return { sessions, engine, emitted, tick, getCard, prFor };
}

describe('StatusEngine', () => {
  test.each([
    { prompted: true, want: 'working' },
    { prompted: false, want: 'idle' },
  ])('a tab spawned with prompt $prompted starts $want', ({ prompted, want }) => {
    // given
    const { sessions, engine } = setup();
    // when
    sessions.emit('spawn', 't1', prompted);
    // then
    expect(engine.statuses()).toEqual([{ tabId: 't1', dot: want, sessionAlive: true, exitCode: null }]);
  });

  test('a Stop hook for a reviewable card tab emits ready', async () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', true);
    emitted.length = 0;
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(emitted).toEqual([{ tabId: 't1', dot: 'ready', sessionAlive: true, exitCode: null }]);
    });
  });

  test.each([
    { name: 'card', getCard: () => Promise.reject(new Error('fetching card: down')), prFor: undefined },
    { name: 'PR', getCard: undefined, prFor: () => Promise.reject(new Error('listing PRs: down')) },
  ])('a Stop hook waits when the $name fetch fails', async ({ getCard, prFor }) => {
    // given
    const { sessions, engine, emitted } = setup({ getCard, prFor });
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe('waiting');
    });
  });

  test('a prompt during the Stop fetch wins', async () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', false);
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // when
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(emitted.map((s) => s.dot)).toEqual(['idle', 'working']);
  });

  test('a Notification hook with idle_prompt emits nothing', () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', true);
    emitted.length = 0;
    // when
    engine.hook({ tabId: 't1', event: 'Notification', notificationType: 'idle_prompt' });
    // then
    expect(emitted).toEqual([]);
  });

  test('a permission prompt emits waiting', () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Notification', notificationType: 'permission_prompt' });
    // then
    expect(emitted.at(-1)?.dot).toBe('waiting');
  });

  test.each([
    { name: 'echo', gap: 100, want: 'idle' },
    { name: 'output', gap: 2000, want: 'working' },
  ])('$name after typing leaves the tab $want', ({ gap, want }) => {
    // given
    const { sessions, engine, tick } = setup();
    sessions.emit('spawn', 't1', false);
    tick(5000);
    sessions.emit('input', 't1');
    tick(gap);
    // when
    sessions.emit('data', 't1', 'x');
    // then
    expect(engine.statuses()[0]?.dot).toBe(want);
  });

  test('an exit marks the session dead', () => {
    // given
    const { sessions, emitted } = setup();
    sessions.emit('spawn', 't1', false);
    // when
    sessions.emit('exit', 't1', 2);
    // then
    expect(emitted.at(-1)).toEqual({ tabId: 't1', dot: 'idle', sessionAlive: false, exitCode: 2 });
  });

  test('a closed tab drops its status', () => {
    // given
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', false);
    // when
    sessions.emit('changed', []);
    // then
    expect(engine.statuses()).toEqual([]);
  });

  test('a Stop hook for a card tab looks up the card and its worktree PR', async () => {
    // given
    const { sessions, engine, emitted, getCard, prFor } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe('ready');
    });
    expect(getCard).toHaveBeenCalledWith('DIG-44');
    expect(prFor).toHaveBeenCalledWith('/wts/dig-44');
  });

  test.each([
    { name: 'Done', status: 'Done', want: 'idle' },
    { name: 'In Progress', status: 'In Progress', want: 'waiting' },
  ] as const)('a Stop hook for a $name card emits $want', async ({ status, want }) => {
    // given
    const { sessions, engine, emitted } = setup({ getCard: () => Promise.resolve({ ...card, status }) });
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe(want);
    });
  });

  test('a Stop hook for a card tab without a worktree skips the PR and waits', async () => {
    // given
    const { sessions, engine, emitted, prFor } = setup({ tab: { ...cardTab, worktreePath: null } });
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe('waiting');
    });
    expect(prFor).not.toHaveBeenCalled();
  });

  test('a Stop hook for a planner tab emits idle without fetching', () => {
    // given
    const planner: TabState = { ...cardTab, kind: 'planner', cardKey: null, worktreePath: null };
    const { sessions, engine, emitted, getCard, prFor } = setup({ tab: planner });
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    expect(emitted.at(-1)?.dot).toBe('idle');
    expect(getCard).not.toHaveBeenCalled();
    expect(prFor).not.toHaveBeenCalled();
  });

  test.each([
    { event: 'Stop', notificationType: null },
    { event: 'UserPromptSubmit', notificationType: null },
    { event: 'Notification', notificationType: 'permission_prompt' },
  ] as const)('a $event hook for an unknown tab emits nothing', async (hook) => {
    // given
    const { engine, emitted, getCard } = setup({ tab: null });
    // when
    engine.hook({ tabId: 'nope', ...hook });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(emitted).toEqual([]);
    expect(getCard).not.toHaveBeenCalled();
  });

  test('a prompt for a working tab emits nothing', () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', true);
    emitted.length = 0;
    // when
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    sessions.emit('data', 't1', 'x');
    // then
    expect(emitted).toEqual([]);
  });

  test('a status change reports the previous dot', () => {
    // given
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', true);
    const listener = vi.fn();
    engine.on('status', listener);
    // when
    engine.hook({ tabId: 't1', event: 'Notification', notificationType: 'permission_prompt' });
    // then
    expect(listener).toHaveBeenCalledWith(
      { tabId: 't1', dot: 'waiting', sessionAlive: true, exitCode: null },
      'working',
    );
  });

  test('a respawn after an exit revives the tab and drops the stale Stop', async () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', false);
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    sessions.emit('exit', 't1', 1);
    // when
    sessions.emit('spawn', 't1', true);
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(emitted.at(-1)).toEqual({ tabId: 't1', dot: 'working', sessionAlive: true, exitCode: null });
    expect(engine.statuses()).toEqual([{ tabId: 't1', dot: 'working', sessionAlive: true, exitCode: null }]);
  });

  test('a changed tab list keeps open tabs', () => {
    // given
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', false);
    sessions.emit('spawn', 't2', true);
    // when
    sessions.emit('changed', [cardTab]);
    // then
    expect(engine.statuses().map((s) => s.tabId)).toEqual(['t1']);
  });
});
