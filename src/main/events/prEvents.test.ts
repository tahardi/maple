import { describe, expect, test, vi } from 'vitest';
import { eventSchemas, type EventRecord, type EventRefs } from '@shared/types/events';
import type { ChecksSummary, PrInfo } from '@shared/types/github';
import type { Card } from '@shared/types/jira';
import type { TabState } from '@shared/types/tabs';
import { PrEvents, type PrEventsDeps } from './prEvents';

const tab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: 'MPL-189',
  sessionId: 's1',
  worktreePath: '/wt',
};
const repo = 'tahardi/maple';
const refs = { project: 'MPL', card: 'MPL-189', tab: 't1', session: 's1' };
const pending: ChecksSummary = {
  passed: 0,
  failed: 0,
  pending: 1,
  total: 1,
  runs: [{ name: 'test', bucket: 'pending', link: '' }],
};
const pr33: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-189] Record PR, CI, and Card Status Changes',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  checks: pending,
};
const pr34: PrInfo = { ...pr33, number: 34 };
const failing: ChecksSummary = {
  passed: 5,
  failed: 1,
  pending: 0,
  total: 6,
  runs: [
    { name: 'lint', bucket: 'pass', link: '' },
    { name: 'test', bucket: 'fail', link: '' },
  ],
};
const twoFailing: ChecksSummary = {
  passed: 4,
  failed: 2,
  pending: 0,
  total: 6,
  runs: [
    { name: 'test', bucket: 'fail', link: '' },
    { name: 'lint', bucket: 'fail', link: '' },
  ],
};
const cancelled: ChecksSummary = {
  passed: 4,
  failed: 2,
  pending: 0,
  total: 6,
  runs: [
    { name: 'test', bucket: 'fail', link: '' },
    { name: 'deploy', bucket: 'cancel', link: '' },
  ],
};
const noChecks: ChecksSummary = { passed: 0, failed: 0, pending: 0, total: 0, runs: [] };

const card = { key: 'MPL-189', status: 'In Review' } as Card;

const sent: { type: string; data: unknown }[] = [];

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function logged(type: string, data: Record<string, unknown>): EventRecord {
  return { v: 1, id: 'e1', at: '2026-11-07T12:00:00.000Z', type, ...refs, data };
}

function setup(options: Partial<PrEventsDeps> = {}) {
  const fake = {
    append: vi.fn((type: string, _refs: EventRefs, data: unknown): Promise<void> => {
      sent.push({ type, data });
      return Promise.resolve();
    }),
    readEvents: vi.fn().mockResolvedValue([]),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const log = vi.fn(() => fake);
  const events = new PrEvents({ log, now: () => new Date('2026-11-08T12:00:00.000Z'), logger, ...options });
  const appended = (type: string): unknown[] =>
    fake.append.mock.calls.filter(([name]) => name === type).map(([, , data]) => data);
  return { events, fake, log, logger, appended };
}

describe('PrEvents', () => {
  test('records the first card status and each change', async () => {
    // given
    const { events, fake } = setup();
    // when
    await events.card(tab, 'In Progress');
    await events.card(tab, 'In Progress');
    await events.card(tab, 'In Review');
    // then
    expect(fake.append.mock.calls).toEqual([
      ['card.status', refs, { from: null, to: 'In Progress' }],
      ['card.status', refs, { from: 'In Progress', to: 'In Review' }],
    ]);
  });

  test('records nothing for a null PR', async () => {
    // given
    const { events, fake } = setup();
    // when
    await events.pr(tab, null);
    // then
    expect(fake.append).not.toHaveBeenCalled();
  });

  test('records pr.opened once per PR number', async () => {
    // given
    const { events, fake } = setup();
    // when
    await events.pr(tab, pr33);
    await events.pr(tab, pr33);
    await events.pr(tab, pr34);
    // then
    expect(fake.append.mock.calls).toEqual([
      ['pr.opened', refs, { repo, pr: 33 }],
      ['pr.opened', refs, { repo, pr: 34 }],
    ]);
  });

  test.each([
    {
      name: 'one run failed',
      seen: [failing],
      want: [{ repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] }],
    },
    {
      name: 'counts changed after a finished result',
      seen: [failing, { ...failing, passed: 6, failed: 0, runs: [] }],
      want: [
        { repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] },
        { repo, pr: 33, passed: 6, failed: 0, failedChecks: [] },
      ],
    },
    {
      name: 'the same counts name a different failed run',
      seen: [failing, { ...failing, runs: [{ name: 'e2e', bucket: 'fail' as const, link: '' }] }],
      want: [
        { repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] },
        { repo, pr: 33, passed: 5, failed: 1, failedChecks: ['e2e'] },
      ],
    },
    {
      name: 'pending checks finish',
      seen: [pending, failing],
      want: [{ repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] }],
    },
    {
      name: 'finished, once when the failed runs come back in another order',
      seen: [twoFailing, { ...twoFailing, runs: [...twoFailing.runs].reverse() }],
      want: [{ repo, pr: 33, passed: 4, failed: 2, failedChecks: ['lint', 'test'] }],
    },
    {
      name: 'a cancelled run does not count as failed',
      seen: [cancelled],
      want: [{ repo, pr: 33, passed: 4, failed: 1, failedChecks: ['test'] }],
    },
    { name: 'finished, not while pending', seen: [pending], want: [] },
    { name: 'finished, not with no checks', seen: [noChecks], want: [] },
    {
      name: 'finished, once for the same result',
      seen: [failing, failing],
      want: [{ repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] }],
    },
  ])('records ci.result when $name', async ({ seen, want }) => {
    // given
    const { events, appended } = setup();
    // when
    for (const checks of seen) {
      await events.pr(tab, { ...pr33, checks });
    }
    // then
    expect(appended('ci.result')).toEqual(want);
  });

  test('records pr.merged once when the PR turns MERGED', async () => {
    // given
    const { events, appended } = setup();
    const merged: PrInfo = { ...pr33, state: 'MERGED' };
    await events.pr(tab, pr33);
    // when
    await events.pr(tab, merged);
    await events.pr(tab, merged);
    // then
    expect(appended('pr.merged')).toEqual([{ repo, pr: 33 }]);
  });

  test('skips tabs with no card', async () => {
    // given
    const { events, fake } = setup();
    const planner: TabState = { ...tab, kind: 'planner', cardKey: null };
    // when
    await events.card(planner, 'In Progress');
    await events.pr(planner, pr33);
    // then
    expect(fake.append).not.toHaveBeenCalled();
  });

  test('records one status when two lookups finish together', async () => {
    // given
    const { events, appended, fake } = setup();
    // when
    await Promise.all([events.card(tab, 'In Progress'), events.card(tab, 'In Progress')]);
    // then
    expect(fake.readEvents).toHaveBeenCalledTimes(1);
    expect(appended('card.status')).toEqual([{ from: null, to: 'In Progress' }]);
  });

  test('records ci.result again for another PR with the same counts', async () => {
    // given
    const { events, appended } = setup();
    // when
    await events.pr(tab, { ...pr33, checks: failing });
    await events.pr(tab, { ...pr34, checks: failing });
    // then
    expect(appended('ci.result')).toEqual([
      { repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] },
      { repo, pr: 34, passed: 5, failed: 1, failedChecks: ['test'] },
    ]);
  });

  test('treats the same number in another repo as another PR', async () => {
    // given
    const { events, appended } = setup();
    const otherRepo: PrInfo = {
      ...pr33,
      url: 'https://github.com/tahardi/other/pull/33',
      state: 'MERGED',
      checks: failing,
    };
    await events.pr(tab, { ...pr33, state: 'MERGED', checks: failing });
    // when
    await events.pr(tab, otherRepo);
    // then
    const other = 'tahardi/other';
    expect(appended('pr.opened')).toEqual([
      { repo, pr: 33 },
      { repo: other, pr: 33 },
    ]);
    expect(appended('pr.merged')).toEqual([
      { repo, pr: 33 },
      { repo: other, pr: 33 },
    ]);
    expect(appended('ci.result')).toEqual([
      { repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] },
      { repo: other, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] },
    ]);
  });

  test('records the session from the latest hook', async () => {
    // given
    const { events, fake } = setup();
    events.hook({ tabId: 't1', event: 'SessionStart', notificationType: null, sessionId: 's2' });
    events.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    events.hook({ tabId: 't2', event: 'SessionStart', notificationType: null, sessionId: 's3' });
    // when
    await events.commented(tab, pr33, 4);
    // then
    expect(fake.append.mock.calls).toEqual([
      ['review.comment', { ...refs, session: 's2' }, { repo, pr: 33, length: 4 }],
    ]);
  });

  test('keeps each card separate', async () => {
    // given
    const { events, appended } = setup();
    const other: TabState = { ...tab, id: 't2', cardKey: 'MPL-1' };
    // when
    await events.card(tab, 'In Progress');
    await events.card(other, 'In Progress');
    // then
    expect(appended('card.status')).toEqual([
      { from: null, to: 'In Progress' },
      { from: null, to: 'In Progress' },
    ]);
  });

  test.each([
    { name: 'approved', call: (events: PrEvents, t: TabState) => events.approved(t, pr33) },
    { name: 'commented', call: (events: PrEvents, t: TabState) => events.commented(t, pr33, 4) },
    { name: 'replied', call: (events: PrEvents, t: TabState) => events.replied(t, pr33, 101, 6) },
    { name: 'resolved', call: (events: PrEvents, t: TabState) => events.resolved(t, 'PRRT_101', true) },
  ])('$name skips a tab with no card', async ({ call }) => {
    // given
    const { events, fake } = setup();
    // when
    await call(events, { ...tab, kind: 'planner', cardKey: null });
    // then
    expect(fake.append).not.toHaveBeenCalled();
  });

  test('records the approval and the merge, and not the merge again at the next stop', async () => {
    // given
    const { events, fake } = setup();
    await events.pr(tab, pr33);
    fake.append.mockClear();
    // when
    await events.approved(tab, pr33);
    await events.pr(tab, { ...pr33, state: 'MERGED' });
    // then
    expect(fake.append.mock.calls).toEqual([
      ['pr.approved', refs, { repo, pr: 33 }],
      ['pr.merged', refs, { repo, pr: 33 }],
    ]);
  });

  test('records review writes as lengths and ids only', async () => {
    // given
    const { events, fake } = setup();
    // when
    await events.commented(tab, pr33, 4);
    await events.replied(tab, pr33, 101, 6);
    await events.resolved(tab, 'PRRT_101', true);
    // then
    expect(fake.append.mock.calls).toEqual([
      ['review.comment', refs, { repo, pr: 33, length: 4 }],
      ['review.reply', refs, { repo, pr: 33, commentId: 101, length: 6 }],
      ['review.resolve', refs, { threadId: 'PRRT_101', resolved: true }],
    ]);
  });

  test('starts from the values already in the log', async () => {
    // given
    const { events, fake } = setup();
    fake.readEvents.mockResolvedValue([
      logged('card.status', { from: 'In Progress', to: 'In Review' }),
      logged('pr.opened', { repo, pr: 33 }),
      logged('ci.result', { repo, pr: 33, passed: 5, failed: 1, failedChecks: ['test'] }),
    ]);
    // when
    await events.card(tab, 'In Review');
    await events.pr(tab, { ...pr33, checks: failing });
    // then
    expect(fake.append).not.toHaveBeenCalled();
    expect(fake.readEvents).toHaveBeenCalledTimes(1);
    expect(fake.readEvents).toHaveBeenCalledWith({
      from: '2025-11-08T12:00:00.000Z',
      to: '2026-11-08T12:00:00.000Z',
      types: ['card.status', 'pr.opened', 'ci.result', 'pr.merged'],
    });
  });

  test('looks back as far as the log keeps records', async () => {
    // given
    const { events, fake } = setup({ keepDays: () => 30 });
    // when
    await events.card(tab, 'In Review');
    // then
    expect(fake.readEvents).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-10-09T12:00:00.000Z' }));
  });

  test('starts from the latest log record of each type', async () => {
    // given
    const { events, appended, fake } = setup();
    fake.readEvents.mockResolvedValue([
      logged('card.status', { from: null, to: 'In Progress' }),
      logged('card.status', { from: 'In Progress', to: 'In Review' }),
    ]);
    // when
    await events.card(tab, 'In Progress');
    // then
    expect(appended('card.status')).toEqual([{ from: 'In Review', to: 'In Progress' }]);
  });

  test('does not record a merge already in the log', async () => {
    // given
    const { events, appended, fake } = setup();
    fake.readEvents.mockResolvedValue([logged('pr.merged', { repo, pr: 33 })]);
    // when
    await events.pr(tab, { ...pr33, state: 'MERGED' });
    // then
    expect(appended('pr.merged')).toEqual([]);
  });

  test('ignores log records with no card or a bad shape', async () => {
    // given
    const { events, appended, fake } = setup();
    fake.readEvents.mockResolvedValue([
      { ...logged('card.status', { from: null, to: 'In Review' }), card: null },
      logged('card.status', { to: 7 }),
      logged('pr.opened', { pr: 'x' }),
      logged('pr.opened', { pr: 33 }),
      logged('ci.result', { repo, pr: 33 }),
      logged('pr.merged', {}),
    ]);
    // when
    await events.card(tab, 'In Review');
    await events.pr(tab, { ...pr33, state: 'MERGED', checks: failing });
    // then
    expect(appended('card.status')).toEqual([{ from: null, to: 'In Review' }]);
    expect(appended('pr.opened')).toEqual([{ repo, pr: 33 }]);
    expect(appended('ci.result')).toHaveLength(1);
    expect(appended('pr.merged')).toEqual([{ repo, pr: 33 }]);
  });

  test('logs and drops a failed append', async () => {
    // given
    const { events, fake, logger } = setup();
    fake.append.mockRejectedValue(new Error('disk full'));
    // when
    const result = events.card(tab, 'In Progress');
    // then
    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', {
      operation: 'append',
      type: 'card.status',
      error: 'disk full',
    });
  });

  test('starts empty and records when the log cannot be read', async () => {
    // given
    const { events, fake, logger, appended } = setup();
    fake.readEvents.mockRejectedValue(new Error('bad dir'));
    // when
    await events.card(tab, 'In Progress');
    // then
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', { operation: 'readEvents', error: 'bad dir' });
    expect(appended('card.status')).toEqual([{ from: null, to: 'In Progress' }]);
  });

  test('logs and drops a record when the log is not started', async () => {
    // given
    const { events, log, logger } = setup();
    const error = 'reading event log: the event log is not started';
    log.mockImplementation(() => {
      throw new Error(error);
    });
    // when
    const result = events.card(tab, 'In Progress');
    // then
    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', { operation: 'readEvents', error });
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', { operation: 'append', type: 'card.status', error });
  });

  test('tapCard records the status for the tab with that card and returns the card', async () => {
    // given
    const { events, appended } = setup();
    const tapped = events.tapCard(
      () => Promise.resolve(card),
      () => [tab],
    );
    // when
    const result = await tapped('MPL-189');
    await settle();
    // then
    expect(result).toBe(card);
    expect(appended('card.status')).toEqual([{ from: null, to: 'In Review' }]);
  });

  test('tapPr records the PR for the tab with that worktree and returns it', async () => {
    // given
    const { events, fake } = setup();
    const prFor = vi.fn((): Promise<PrInfo | null> => Promise.resolve(pr33));
    const tapped = events.tapPr(prFor, () => [tab]);
    // when
    const result = await tapped('/wt', 'MPL');
    await settle();
    // then
    expect(result).toBe(pr33);
    expect(prFor).toHaveBeenCalledWith('/wt', 'MPL');
    expect(fake.append.mock.calls).toEqual([['pr.opened', refs, { repo, pr: 33 }]]);
  });

  test.each([
    {
      name: 'tapCard',
      call: (events: PrEvents) =>
        events.tapCard(
          () => Promise.reject(new Error('offline')),
          () => [tab],
        )('MPL-189'),
    },
    {
      name: 'tapPr',
      call: (events: PrEvents) =>
        events.tapPr(
          () => Promise.reject(new Error('offline')),
          () => [tab],
        )('/wt', 'MPL'),
    },
  ])('$name passes the lookup error through and records nothing', async ({ call }) => {
    // given
    const { events, fake } = setup();
    // when
    const result = call(events);
    // then
    await expect(result).rejects.toThrow('offline');
    await settle();
    expect(fake.append).not.toHaveBeenCalled();
  });

  test('records nothing when no open tab matches', async () => {
    // given
    const { events, fake } = setup();
    const other: TabState = { ...tab, cardKey: 'MPL-1', worktreePath: '/other' };
    const tappedCard = events.tapCard(
      () => Promise.resolve(card),
      () => [other],
    );
    const tappedPr = events.tapPr(
      () => Promise.resolve(pr33),
      () => [other],
    );
    // when
    await tappedCard('MPL-189');
    await tappedPr('/wt', 'MPL');
    await settle();
    // then
    expect(fake.append).not.toHaveBeenCalled();
  });

  test('the taps return before the log is read', async () => {
    // given
    const { events, fake } = setup();
    fake.readEvents.mockReturnValue(new Promise(() => undefined));
    const tappedCard = events.tapCard(
      () => Promise.resolve(card),
      () => [tab],
    );
    const tappedPr = events.tapPr(
      () => Promise.resolve(pr33),
      () => [tab],
    );
    // when
    const results = await Promise.all([tappedCard('MPL-189'), tappedPr('/wt', 'MPL')]);
    // then
    expect(results).toEqual([card, pr33]);
  });

  test('a failed append does not break a tap', async () => {
    // given
    const { events, fake, logger } = setup();
    fake.append.mockRejectedValue(new Error('disk full'));
    const tapped = events.tapCard(
      () => Promise.resolve(card),
      () => [tab],
    );
    // when
    const result = await tapped('MPL-189');
    await settle();
    // then
    expect(result).toBe(card);
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', {
      operation: 'append',
      type: 'card.status',
      error: 'disk full',
    });
  });

  test('appends data its schema keeps whole', () => {
    // given
    const types = new Set(sent.map(({ type }) => type));
    // when
    const parsed = sent.map(({ type, data }) => eventSchemas[type as keyof typeof eventSchemas].parse(data));
    // then
    expect(types.size).toBe(8);
    expect(parsed).toEqual(sent.map(({ data }) => data));
  });
});
