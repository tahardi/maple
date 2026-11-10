import { describe, expect, test, vi } from 'vitest';
import type { ActionConfig } from '@shared/types/config';
import { eventSchemas, type EventRefs, type UiActionData } from '@shared/types/events';
import type { TabState } from '@shared/types/tabs';
import { redact } from '@main/app/log';
import { uiActionRecorder } from './uiActions';

const cardTab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: 'MPL-7',
  sessionId: 's1',
  worktreePath: null,
};

const plannerTab: TabState = { ...cardTab, kind: 'planner', cardKey: null };

const noRefs: EventRefs = { project: null, card: null, tab: null, session: null };
const cardRefs: EventRefs = { project: 'MPL', card: 'MPL-7', tab: null, session: null };
const projectRefs: EventRefs = { project: 'MPL', card: null, tab: null, session: null };
const tabRefs: EventRefs = { project: 'MPL', card: 'MPL-7', tab: 't1', session: 's1' };

const actions: readonly ActionConfig[] = [
  { label: 'Address review', prompt: '/card {key}' },
  { label: 'Fix PR', prompt: 'Fix PR {pr} (ASAP?) for {key}' },
];

function setup(fixture: TabState = cardTab) {
  const append = vi.fn<(refs: EventRefs, data: UiActionData) => Promise<void>>(() => Promise.resolve());
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const closeNeedsConfirm = vi.fn<(tabId: string, force: boolean) => boolean>(() => false);
  const record = uiActionRecorder(
    { tab: (id) => (id === 't1' ? fixture : null), actions: () => actions, closeNeedsConfirm, append },
    logger,
  );
  return { append, closeNeedsConfirm, logger, record };
}

describe('uiActionRecorder', () => {
  test.each<{ channel: string; args: readonly unknown[]; refs: EventRefs }>([
    { channel: 'tabs:startCard', args: ['MPL', 'MPL-7'], refs: cardRefs },
    { channel: 'tabs:openCard', args: ['MPL', 'MPL-7'], refs: cardRefs },
    { channel: 'tabs:openVault', args: ['MPL'], refs: projectRefs },
    { channel: 'tabs:close', args: ['t1', false], refs: tabRefs },
    { channel: 'tabs:resume', args: ['t1'], refs: tabRefs },
    { channel: 'tabs:startFresh', args: ['t1'], refs: tabRefs },
    { channel: 'tabs:setActive', args: ['t1'], refs: tabRefs },
    { channel: 'tabs:setActive', args: [null], refs: noRefs },
    { channel: 'jira:report', args: [{ kind: 'bug', title: 'x', description: 'y' }], refs: noRefs },
  ])('records $channel', ({ channel, args, refs }) => {
    // given
    const { append, record } = setup();

    // when
    record(channel, args);

    // then
    expect(append.mock.calls).toEqual([[refs, { channel, action: null, length: null }]]);
  });

  test.each([
    { channel: 'session:write' },
    { channel: 'session:resize' },
    { channel: 'terminal:write' },
    { channel: 'terminal:resize' },
    { channel: 'terminal:open' },
    { channel: 'tabs:cost' },
    { channel: 'tabs:openPlanner' },
    { channel: 'session:backlog' },
  ])('records nothing for $channel', ({ channel }) => {
    // given
    const { append, record } = setup();

    // when
    record(channel, ['t1', 'secret text']);

    // then
    expect(append).not.toHaveBeenCalled();
  });

  test.each([
    { text: '/card MPL-7', action: 'Address review' },
    { text: 'Fix PR 12 (ASAP?) for MPL-7', action: 'Fix PR' },
    { text: 'Fix PR  (ASAP?) for MPL-7', action: 'Fix PR' },
    { text: '/card MPL-7 close', action: null },
    { text: '/card MPL-8', action: null },
    { text: 'Fix PR 12 (ASAPX for MPL-7', action: null },
  ])('records $text as action $action', ({ text, action }) => {
    // given
    const { append, record } = setup();

    // when
    record('session:sendPrompt', ['t1', text]);

    // then
    expect(append.mock.calls).toEqual([[tabRefs, { channel: 'session:sendPrompt', action, length: text.length }]]);
  });

  test.each([
    { force: false, needsConfirm: true, records: 0 },
    { force: false, needsConfirm: false, records: 1 },
    { force: true, needsConfirm: false, records: 1 },
  ])(
    'writes $records records for tabs:close with force $force and needsConfirm $needsConfirm',
    ({ force, needsConfirm, records }) => {
      // given
      const { append, closeNeedsConfirm, record } = setup();
      closeNeedsConfirm.mockReturnValue(needsConfirm);

      // when
      record('tabs:close', ['t1', force]);

      // then
      expect(closeNeedsConfirm.mock.calls).toEqual([['t1', force]]);
      expect(append).toHaveBeenCalledTimes(records);
    },
  );

  test('records a planner prompt with no action', () => {
    // given
    const { append, record } = setup(plannerTab);
    const text = '/card {key}';

    // when
    record('session:sendPrompt', ['t1', text]);

    // then
    expect(append.mock.calls).toEqual([
      [
        { project: 'MPL', card: null, tab: 't1', session: 's1' },
        { channel: 'session:sendPrompt', action: null, length: text.length },
      ],
    ]);
  });

  test('records one event per card moved to the sprint', () => {
    // given
    const { append, record } = setup();

    // when
    record('jira:moveToSprint', [5, ['MPL-1', 'ABC-2']]);

    // then
    const data = { channel: 'jira:moveToSprint', action: null, length: null };
    expect(append.mock.calls).toEqual([
      [{ project: 'MPL', card: 'MPL-1', tab: null, session: null }, data],
      [{ project: 'ABC', card: 'ABC-2', tab: null, session: null }, data],
    ]);
  });

  test.each([
    { text: 'Fix PR abc (ASAP?) for MPL-7', action: null, prompts: actions },
    {
      text: '/card MPL-7',
      action: 'First',
      prompts: [
        { label: 'First', prompt: '/card {key}' },
        { label: 'Second', prompt: '/card {key}' },
      ],
    },
    {
      text: 'MPL-7 MPL-7 12 34',
      action: 'Twice',
      prompts: [{ label: 'Twice', prompt: '{key} {key} {pr} {pr}' }],
    },
  ])('matches $text against the configured prompts', ({ text, action, prompts }) => {
    // given
    const append = vi.fn<(refs: EventRefs, data: UiActionData) => Promise<void>>(() => Promise.resolve());
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const record = uiActionRecorder(
      { tab: () => cardTab, actions: () => prompts, closeNeedsConfirm: () => false, append },
      logger,
    );

    // when
    record('session:sendPrompt', ['t1', text]);

    // then
    expect(append.mock.calls[0]?.[1].action).toBe(action);
  });

  test.each([
    { channel: 'tabs:resume', args: ['gone'], data: { action: null, length: null } },
    { channel: 'session:sendPrompt', args: ['gone', '/card MPL-7'], data: { action: null, length: 11 } },
  ])('keeps the tab id and nulls the rest for an unknown tab on $channel', ({ channel, args, data }) => {
    // given
    const { append, record } = setup();

    // when
    record(channel, args);

    // then
    expect(append.mock.calls).toEqual([
      [
        { project: null, card: null, tab: 'gone', session: null },
        { channel, ...data },
      ],
    ]);
  });

  test.each([
    {
      name: 'tab lookup',
      deps: {
        tab: () => {
          throw new Error('boom');
        },
        actions: () => actions,
        append: () => Promise.resolve(),
      },
    },
    {
      name: 'actions lookup',
      deps: {
        tab: () => cardTab,
        actions: () => {
          throw new Error('boom');
        },
        append: () => Promise.resolve(),
      },
    },
    {
      name: 'append',
      deps: {
        tab: () => cardTab,
        actions: () => actions,
        append: () => {
          throw new Error('boom');
        },
      },
    },
  ])('logs a warning and does not throw when $name throws synchronously', async ({ deps }) => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const record = uiActionRecorder({ ...deps, closeNeedsConfirm: () => false }, logger);

    // when
    record('session:sendPrompt', ['t1', '/card MPL-7']);
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalled();
    });

    // then
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', {
      operation: 'recordUiAction',
      channel: 'session:sendPrompt',
      error: 'boom',
    });
  });

  test('keeps every data field through the schema and redaction', () => {
    // given
    const data = { channel: 'session:sendPrompt', action: 'Fix PR', length: 12 };

    // when
    const stored = redact(eventSchemas['ui.action'].parse(data));

    // then
    expect(stored).toEqual(data);
  });

  test('logs a warning when appending fails', async () => {
    // given
    const { append, logger, record } = setup();
    append.mockRejectedValue(new Error('disk full'));

    // when
    record('tabs:resume', ['t1']);
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalled();
    });

    // then
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', {
      operation: 'recordUiAction',
      channel: 'tabs:resume',
      error: 'disk full',
    });
  });
});
