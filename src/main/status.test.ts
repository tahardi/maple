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

function setup(overrides: { getCard?: () => Promise<Card>; prFor?: () => Promise<PrInfo | null> } = {}) {
  const sessions = Object.assign(new EventEmitter(), { get: vi.fn(() => cardTab) });
  let now = 0;
  const engine = new StatusEngine({
    sessions: sessions as unknown as SessionManager,
    getCard: overrides.getCard ?? (() => Promise.resolve(card)),
    prFor: overrides.prFor ?? (() => Promise.resolve(openPr)),
    now: () => now,
  });
  const emitted: TabStatus[] = [];
  engine.on('status', (s) => {
    emitted.push(s);
  });
  const tick = (ms: number) => {
    now += ms;
  };
  return { sessions, engine, emitted, tick };
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
});
