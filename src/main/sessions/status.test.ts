import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Card } from '@shared/types/jira';
import type { PrInfo } from '@shared/types/github';
import type { TabState, TabStatus } from '@shared/types/tabs';
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
  cardImpacts: null,
  body: '',
  checks: { passed: 2, failed: 0, pending: 0, total: 2, runs: [] },
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
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const engine = new StatusEngine({
    sessions: sessions as unknown as SessionManager,
    getCard,
    prFor,
    logger,
  });
  const emitted: TabStatus[] = [];
  engine.on('status', (s) => {
    emitted.push(s);
  });
  return { sessions, engine, emitted, getCard, prFor, logger };
}

describe('StatusEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    { prompted: true, want: 'working' },
    { prompted: false, want: 'idle' },
  ])('a tab spawned with prompt $prompted starts $want', ({ prompted, want }) => {
    // given
    const { sessions, engine } = setup();
    // when
    sessions.emit('spawn', 't1', prompted);
    // then
    expect(engine.statuses()).toEqual([
      { tabId: 't1', dot: want, sessionAlive: true, exitCode: null, resumeFailed: false },
    ]);
  });

  test('an unprompted spawn of a Done card tab emits merged', async () => {
    // given
    const { sessions, emitted, prFor } = setup({ getCard: () => Promise.resolve({ ...card, status: 'Done' }) });
    // when
    sessions.emit('spawn', 't1', false);
    // then
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe('merged');
    });
    expect(prFor).not.toHaveBeenCalled();
  });

  test.each(['To Do', 'In Progress', 'In Review'] as const)(
    'an unprompted spawn of a card in %s stays idle',
    async (status) => {
      // given
      const { sessions, engine, emitted, getCard } = setup({ getCard: () => Promise.resolve({ ...card, status }) });
      // when
      sessions.emit('spawn', 't1', false);
      // then
      await vi.waitFor(() => {
        expect(getCard).toHaveBeenCalledWith('DIG-44');
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(emitted.map((s) => s.dot)).toEqual(['idle']);
      expect(engine.statuses()[0]?.dot).toBe('idle');
    },
  );

  test('a prompted spawn does not look up the card', async () => {
    // given
    const { sessions, getCard } = setup();
    // when
    sessions.emit('spawn', 't1', true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(getCard).not.toHaveBeenCalled();
  });

  test('an unprompted spawn with a failed card lookup stays idle and warns', async () => {
    // given
    const { sessions, engine, emitted, logger } = setup({
      getCard: () => Promise.reject(new Error('fetching card: down')),
    });
    // when
    sessions.emit('spawn', 't1', false);
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
        operation: 'getCard',
        error: 'fetching card: down',
      });
    });
    expect(emitted.map((s) => s.dot)).toEqual(['idle']);
    expect(engine.statuses()[0]?.dot).toBe('idle');
  });

  test.each([
    { name: 'a planner tab', tab: { ...cardTab, kind: 'planner', cardKey: null, worktreePath: null } as const },
    { name: 'a card tab without a card key', tab: { ...cardTab, cardKey: null } },
    { name: 'an unknown tab', tab: null },
  ])('an unprompted spawn of $name does not look up a card', async ({ tab }) => {
    // given
    const { sessions, getCard } = setup({ tab });
    // when
    sessions.emit('spawn', 't1', false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(getCard).not.toHaveBeenCalled();
  });

  test('logs the card status when a spawn restores the merged dot', async () => {
    // given
    const { sessions, logger } = setup({ getCard: () => Promise.resolve({ ...card, status: 'Done' }) });
    // when
    sessions.emit('spawn', 't1', false);
    // then
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('dot', 'changed', {
        tabId: 't1',
        from: 'idle',
        to: 'merged',
        input: 'spawn',
        cardStatus: 'Done',
      });
    });
  });

  test('a prompt during the spawn lookup wins', async () => {
    // given
    let resolveCard: (c: Card) => void = () => undefined;
    const pending = new Promise<Card>((resolve) => {
      resolveCard = resolve;
    });
    const { sessions, engine, emitted } = setup({ getCard: () => pending });
    sessions.emit('spawn', 't1', false);
    // when
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    resolveCard({ ...card, status: 'Done' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(emitted.map((s) => s.dot)).toEqual(['idle', 'working']);
  });

  test('a respawn during the spawn lookup wins', async () => {
    // given
    const lookups: ((c: Card) => void)[] = [];
    const getCard = () =>
      new Promise<Card>((resolve) => {
        lookups.push(resolve);
      });
    const { sessions, engine, getCard: lookup } = setup({ getCard });
    sessions.emit('spawn', 't1', false);
    sessions.emit('spawn', 't1', false);
    lookups[1]?.({ ...card, status: 'In Review' });
    await vi.waitFor(() => {
      expect(lookup).toHaveBeenCalledTimes(2);
    });
    // when
    lookups[0]?.({ ...card, status: 'Done' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(engine.statuses()[0]?.dot).toBe('idle');
  });

  test('a Stop during the spawn lookup wins', async () => {
    // given
    const lookups: ((c: Card) => void)[] = [];
    const getCard = () =>
      new Promise<Card>((resolve) => {
        lookups.push(resolve);
      });
    const { sessions, engine, emitted } = setup({ getCard, prFor: () => Promise.resolve(null) });
    sessions.emit('spawn', 't1', false);
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    lookups[1]?.({ ...card, status: 'In Progress' });
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe('waiting');
    });
    // when
    lookups[0]?.({ ...card, status: 'Done' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(engine.statuses()[0]?.dot).toBe('waiting');
  });

  test('a tab closed during the spawn lookup emits nothing more', async () => {
    // given
    let resolveCard: (c: Card) => void = () => undefined;
    const pending = new Promise<Card>((resolve) => {
      resolveCard = resolve;
    });
    const { sessions, engine, emitted } = setup({ getCard: () => pending });
    sessions.emit('spawn', 't1', false);
    sessions.emit('changed', []);
    // when
    resolveCard({ ...card, status: 'Done' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(emitted.map((s) => s.dot)).toEqual(['idle']);
    expect(engine.statuses()).toEqual([]);
  });

  test('logs a dot change', () => {
    // given
    const { sessions, engine, logger } = setup();
    sessions.emit('spawn', 't1', false);
    // when
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    // then
    expect(logger.info).toHaveBeenCalledWith('dot', 'changed', {
      tabId: 't1',
      from: 'idle',
      to: 'working',
      input: 'prompt',
    });
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
      expect(emitted).toEqual([{ tabId: 't1', dot: 'ready', sessionAlive: true, exitCode: null, resumeFailed: false }]);
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

  test.each([
    { name: 'getCard', scope: 'jira', getCard: () => new Promise<Card>(() => undefined), prFor: undefined },
    { name: 'prFor', scope: 'gh', getCard: undefined, prFor: () => new Promise<PrInfo | null>(() => undefined) },
  ])(
    'a Stop lookup that never settles gives up and waits after 15 seconds when $name hangs',
    async ({ name, scope, getCard, prFor }) => {
      // given
      vi.useFakeTimers();
      const { sessions, engine, logger } = setup({ getCard, prFor });
      sessions.emit('spawn', 't1', true);
      // when
      engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
      await vi.advanceTimersByTimeAsync(15_000);
      // then
      expect(engine.statuses()[0]?.dot).toBe('waiting');
      expect(logger.warn).toHaveBeenCalledWith(scope, 'failed', { operation: name, error: 'timing out after 15s' });
    },
  );

  test('a Stop lookup that never settles keeps the tab working until 15 seconds pass', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, engine } = setup({ getCard: () => new Promise<Card>(() => undefined) });
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    await vi.advanceTimersByTimeAsync(14_999);
    // then
    expect(engine.statuses()[0]?.dot).toBe('working');
  });

  test('a prompt during a Stop lookup that never settles keeps the tab working', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, engine } = setup({ getCard: () => new Promise<Card>(() => undefined) });
    sessions.emit('spawn', 't1', true);
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // when
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    await vi.advanceTimersByTimeAsync(15_000);
    // then
    expect(engine.statuses()[0]?.dot).toBe('working');
  });

  test('a Stop lookup that settles before 15 seconds leaves no timer behind', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(engine.statuses()[0]?.dot).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('a spawn lookup that never settles gives up after 15 seconds and stays idle', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, engine, logger } = setup({ getCard: () => new Promise<Card>(() => undefined) });
    // when
    sessions.emit('spawn', 't1', false);
    await vi.advanceTimersByTimeAsync(15_000);
    // then
    expect(engine.statuses()[0]?.dot).toBe('idle');
    expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
      operation: 'getCard',
      error: 'timing out after 15s',
    });
  });

  test('an interrupt on a working card tab looks up the card like a Stop', async () => {
    // given
    const { sessions, engine, getCard } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    sessions.emit('interrupt', 't1');
    // then
    await vi.waitFor(() => {
      expect(engine.statuses()[0]?.dot).toBe('ready');
    });
    expect(getCard).toHaveBeenCalledWith('DIG-44');
  });

  test('an interrupt on a working planner tab moves it to idle without a lookup', () => {
    // given
    const planner: TabState = { ...cardTab, kind: 'planner', cardKey: null, worktreePath: null };
    const { sessions, engine, getCard } = setup({ tab: planner });
    sessions.emit('spawn', 't1', true);
    // when
    sessions.emit('interrupt', 't1');
    // then
    expect(engine.statuses()[0]?.dot).toBe('idle');
    expect(getCard).not.toHaveBeenCalled();
  });

  test('an interrupt on an unknown tab changes nothing', () => {
    // given
    const { sessions, engine, emitted, getCard } = setup({ tab: null });
    // when
    sessions.emit('interrupt', 'nope');
    // then
    expect(emitted).toEqual([]);
    expect(engine.statuses()).toEqual([]);
    expect(getCard).not.toHaveBeenCalled();
  });

  test('an interrupt on a tab that is not working changes nothing', async () => {
    // given
    const { sessions, engine, emitted, getCard } = setup();
    sessions.emit('spawn', 't1', false);
    getCard.mockClear();
    // when
    sessions.emit('interrupt', 't1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    // then
    expect(getCard).not.toHaveBeenCalled();
    expect(emitted.map((s) => s.dot)).toEqual(['idle']);
    expect(engine.statuses()[0]?.dot).toBe('idle');
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

  test.each(['merged', 'waiting', 'ready'] as const)('output and keystrokes leave a %s tab alone', async (want) => {
    // given
    const getCard = () =>
      Promise.resolve({ ...card, status: want === 'merged' ? ('Done' as const) : ('In Progress' as const) });
    const prFor = () => Promise.resolve(want === 'ready' ? openPr : null);
    const ready = () => Promise.resolve({ ...card, status: 'In Review' as const });
    const { sessions, engine, emitted } = setup({ getCard: want === 'ready' ? ready : getCard, prFor });
    sessions.emit('spawn', 't1', true);
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe(want);
    });
    emitted.length = 0;
    // when
    sessions.emit('data', 't1', 'redraw');
    sessions.emit('input', 't1');
    sessions.emit('data', 't1', 'late');
    // then
    expect(emitted).toEqual([]);
    expect(engine.statuses()[0]?.dot).toBe(want);
  });

  test('startup output leaves a new tab idle', () => {
    // given
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', false);
    // when
    sessions.emit('data', 't1', 'banner');
    // then
    expect(engine.statuses()[0]?.dot).toBe('idle');
  });

  test('an exit marks the session dead', () => {
    // given
    const { sessions, emitted } = setup();
    sessions.emit('spawn', 't1', false);
    // when
    sessions.emit('exit', 't1', 2);
    // then
    expect(emitted.at(-1)).toEqual({ tabId: 't1', dot: 'idle', sessionAlive: false, exitCode: 2, resumeFailed: false });
  });

  test('an exit of a working tab marks the session dead and idle in one update', () => {
    // given
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', true);
    const listener = vi.fn();
    engine.on('status', listener);
    // when
    sessions.emit('exit', 't1', 2);
    // then
    expect(listener.mock.calls).toEqual([
      [{ tabId: 't1', dot: 'idle', sessionAlive: false, exitCode: 2, resumeFailed: false }, 'working'],
    ]);
  });

  test('an exit of a ready tab stays ready', async () => {
    // given
    const { sessions, engine, emitted } = setup();
    sessions.emit('spawn', 't1', true);
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    await vi.waitFor(() => {
      expect(emitted.at(-1)?.dot).toBe('ready');
    });
    // when
    sessions.emit('exit', 't1', 0);
    // then
    expect(emitted.at(-1)).toEqual({
      tabId: 't1',
      dot: 'ready',
      sessionAlive: false,
      exitCode: 0,
      resumeFailed: false,
    });
  });

  test.each([
    { name: 'a resume exiting 1 after 4999 ms', resumes: true, ms: 4999, code: 1, want: true },
    { name: 'a resume exiting 1 after 5000 ms', resumes: true, ms: 5000, code: 1, want: false },
    { name: 'a resume exiting 0 after 10 ms', resumes: true, ms: 10, code: 0, want: false },
    { name: 'a fresh session exiting 1 after 10 ms', resumes: false, ms: 10, code: 1, want: false },
  ])('$name sets resumeFailed $want', ({ resumes, ms, code, want }) => {
    // given
    vi.useFakeTimers();
    const { sessions, emitted } = setup();
    sessions.emit('spawn', 't1', false, resumes);
    vi.advanceTimersByTime(ms);
    // when
    sessions.emit('exit', 't1', code);
    // then
    expect(emitted.at(-1)).toEqual({
      tabId: 't1',
      dot: 'idle',
      sessionAlive: false,
      exitCode: code,
      resumeFailed: want,
    });
  });

  test('a respawn after a failed resume clears resumeFailed', () => {
    // given
    const { sessions, engine } = setup();
    sessions.emit('spawn', 't1', false, true);
    sessions.emit('exit', 't1', 1);
    // when
    sessions.emit('spawn', 't1', true, false);
    // then
    expect(engine.statuses()[0]?.resumeFailed).toBe(false);
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
    { name: 'Done', status: 'Done', want: 'merged' },
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
      { tabId: 't1', dot: 'waiting', sessionAlive: true, exitCode: null, resumeFailed: false },
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
    expect(emitted.at(-1)).toEqual({
      tabId: 't1',
      dot: 'working',
      sessionAlive: true,
      exitCode: null,
      resumeFailed: false,
    });
    expect(engine.statuses()).toEqual([
      { tabId: 't1', dot: 'working', sessionAlive: true, exitCode: null, resumeFailed: false },
    ]);
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

  test('logs the card status, PR state, and failed checks on a Stop', async () => {
    // given
    const { sessions, engine, logger } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('dot', 'changed', {
        tabId: 't1',
        from: 'working',
        to: 'ready',
        input: 'stop',
        cardStatus: 'In Review',
        pr: 'OPEN',
        failedChecks: 0,
      });
    });
  });

  test.each([
    {
      name: 'card',
      scope: 'jira',
      operation: 'getCard',
      getCard: () => Promise.reject(new Error('fetching card: down')),
      prFor: undefined,
      error: 'fetching card: down',
    },
    {
      name: 'PR',
      scope: 'gh',
      operation: 'prFor',
      getCard: undefined,
      prFor: () => Promise.reject(new Error('listing PRs: down')),
      error: 'listing PRs: down',
    },
  ])('logs a failed $name fetch at warn', async ({ scope, operation, getCard, prFor, error }) => {
    // given
    const { sessions, engine, logger } = setup({ getCard, prFor });
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(scope, 'failed', { operation, error });
    });
  });

  test('logs a failed resume at warn', () => {
    // given
    vi.useFakeTimers();
    const { sessions, logger } = setup();
    sessions.emit('spawn', 't1', false, true);
    vi.advanceTimersByTime(10);
    // when
    sessions.emit('exit', 't1', 1);
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'resume failed', { tabId: 't1', code: 1 });
  });

  test('logs an exit that moves a working tab to idle', () => {
    // given
    const { sessions, logger } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    sessions.emit('exit', 't1', 2);
    // then
    expect(logger.info).toHaveBeenCalledWith('dot', 'changed', {
      tabId: 't1',
      from: 'working',
      to: 'idle',
      input: 'exit',
    });
  });

  test('logs a respawn that changes the dot', () => {
    // given
    const { sessions, logger } = setup();
    sessions.emit('spawn', 't1', false);
    // when
    sessions.emit('spawn', 't1', true);
    // then
    expect(logger.info).toHaveBeenCalledWith('dot', 'changed', {
      tabId: 't1',
      from: 'idle',
      to: 'working',
      input: 'spawn',
    });
  });

  test('logs nothing when the dot stays the same', () => {
    // given
    const { sessions, engine, logger } = setup();
    sessions.emit('spawn', 't1', true);
    // when
    engine.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    // then
    expect(logger.info).not.toHaveBeenCalled();
  });
});
