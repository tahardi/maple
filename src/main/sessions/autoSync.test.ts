import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { syncPrompt } from '@shared/prompts';
import type { Card } from '@shared/types/jira';
import type { PrInfo } from '@shared/types/github';
import type { TabState, TabStatus } from '@shared/types/tabs';
import type { MergeState } from '@main/github/mergeState';
import { AutoSync, POLL_MS } from './autoSync';
import type { SessionManager } from './sessions';
import { StatusEngine } from './status';

const cardTab = (id: string, cardKey: string, worktreePath: string | null): TabState => ({
  id,
  projectKey: 'DIG',
  kind: 'card',
  cardKey,
  sessionId: `s-${id}`,
  worktreePath,
  worktreePaths: [],
});

const card = (key: string, status: Card['status'] = 'In Review'): Card => ({
  key,
  summary: 'Card',
  status,
  points: 1,
  labels: [],
  blockedBy: [],
  epic: null,
  descriptionMd: '',
  url: `https://example.atlassian.net/browse/${key}`,
});

const openPr: PrInfo = {
  number: 3,
  url: 'https://github.com/o/r/pull/3',
  title: 'PR',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  checks: { passed: 2, failed: 0, pending: 0, total: 2, runs: [] },
};

const conflicting: MergeState = { mergeable: 'CONFLICTING', headSha: 'a'.repeat(40) };

type Overrides = {
  tabs?: TabState[];
  getCard?: (key: string) => Promise<Card>;
  prFor?: (worktree: string, projectKey: string) => Promise<PrInfo | null>;
};

function setup(overrides: Overrides = {}) {
  const tabs = overrides.tabs ?? [cardTab('t1', 'DIG-44', '/wts/dig-44')];
  const sessions = Object.assign(new EventEmitter(), {
    get: vi.fn((id: string) => tabs.find((t) => t.id === id) ?? null),
    list: vi.fn(() => tabs),
    sendPrompt: vi.fn(),
  });
  const getCard = vi.fn(overrides.getCard ?? ((key: string) => Promise.resolve(card(key))));
  const prFor = vi.fn(overrides.prFor ?? (() => Promise.resolve(openPr)));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const status = new StatusEngine({
    sessions: sessions as unknown as SessionManager,
    getCard,
    prFor,
    waitLimitMs: () => 60_000,
    logger,
  });
  const states: Record<string, MergeState | null> = {};
  const mergeState = vi.fn((worktree: string) => Promise.resolve(worktree in states ? states[worktree] : conflicting));
  const auto = new AutoSync({
    sessions: sessions as unknown as SessionManager,
    status,
    getCard,
    mergeState,
    logger,
  });
  const emitted: TabStatus[] = [];
  status.on('status', (s) => {
    emitted.push(s);
  });
  for (const tab of tabs) {
    sessions.emit('spawn', tab.id, true, false);
  }
  const syncOf = (tabId: string) => status.statuses().find((s) => s.tabId === tabId)?.sync;
  const activate = async (tabId: string | null) => {
    auto.activate(tabId);
    await vi.advanceTimersByTimeAsync(0);
  };
  const stop = async (tabId: string) => {
    status.hook({ tabId, event: 'Stop', notificationType: null });
    await vi.waitFor(() => {
      expect(status.statuses().find((s) => s.tabId === tabId)?.dot).not.toBe('working');
    });
  };
  const syncTurn = async (tabId: string) => {
    status.hook({ tabId, event: 'UserPromptSubmit', notificationType: null });
    await stop(tabId);
  };
  return { sessions, status, auto, states, mergeState, logger, emitted, syncOf, activate, stop, syncTurn };
}

describe('AutoSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a hidden tab is never checked', async () => {
    // given
    const { auto, sessions, mergeState, stop } = setup();
    await stop('t1');
    // when
    await auto.check();
    // then
    expect(mergeState).not.toHaveBeenCalled();
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
  });

  test('switching to an idle In Review tab whose PR conflicts prompts it and marks it syncing', async () => {
    // given
    const { sessions, syncOf, activate, stop } = setup();
    await stop('t1');
    // when
    await activate('t1');
    // then
    expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44', ['/wts/dig-44']));
    expect(syncOf('t1')).toBe('syncing');
  });

  test.each([{ mergeable: 'MERGEABLE' as const }, { mergeable: 'UNKNOWN' as const }])(
    'switching to a tab whose PR is $mergeable sends nothing',
    async ({ mergeable }) => {
      // given
      const { sessions, states, syncOf, activate, stop } = setup();
      states['/wts/dig-44'] = { ...conflicting, mergeable };
      await stop('t1');
      // when
      await activate('t1');
      // then
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
      expect(syncOf('t1')).toBeNull();
    },
  );

  test.each([
    { case: 'card is In Progress', cardStatus: 'In Progress' as const, noPr: false, exits: false, tab: undefined },
    { case: 'PR is not open', cardStatus: 'In Review' as const, noPr: true, exits: false, tab: undefined },
    { case: 'session is not alive', cardStatus: 'In Review' as const, noPr: false, exits: true, tab: undefined },
    {
      case: 'tab has no worktree',
      cardStatus: 'In Review' as const,
      noPr: false,
      exits: false,
      tab: cardTab('t1', 'DIG-44', null),
    },
    {
      case: 'tab is a planner',
      cardStatus: 'In Review' as const,
      noPr: false,
      exits: false,
      tab: { ...cardTab('t1', 'DIG-44', '/wts/dig-44'), kind: 'planner' as const, cardKey: null },
    },
  ])('switching skips a tab whose $case', async ({ cardStatus, noPr, exits, tab }) => {
    // given
    const { sessions, states, syncOf, activate, stop } = setup({
      tabs: tab === undefined ? undefined : [tab],
      getCard: (key) => Promise.resolve(card(key, cardStatus)),
    });
    if (noPr) {
      states['/wts/dig-44'] = null;
    }
    await stop('t1');
    if (exits) {
      sessions.emit('exit', 't1', 0);
    }
    // when
    await activate('t1');
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    expect(syncOf('t1')).toBeNull();
  });

  test('a multi-repo card names only the worktrees that conflict', async () => {
    // given
    const tab = { ...cardTab('t1', 'DIG-44', null), worktreePaths: ['/wts/a', '/wts/b'] };
    const { sessions, states, activate, stop } = setup({ tabs: [tab] });
    states['/wts/a'] = { ...conflicting, mergeable: 'MERGEABLE' };
    await stop('t1');
    // when
    await activate('t1');
    // then
    expect(sessions.sendPrompt.mock.calls).toEqual([['t1', syncPrompt('DIG-44', ['/wts/b'])]]);
  });

  test('a conflict that appears while the tab is active is caught on the next poll', async () => {
    // given
    const { auto, sessions, states, activate, stop } = setup();
    states['/wts/dig-44'] = { ...conflicting, mergeable: 'MERGEABLE' };
    await stop('t1');
    await activate('t1');
    const stopPolling = auto.start();
    states['/wts/dig-44'] = conflicting;
    // when
    await vi.advanceTimersByTimeAsync(POLL_MS);
    stopPolling();
    // then
    expect(sessions.sendPrompt.mock.calls).toEqual([['t1', syncPrompt('DIG-44', ['/wts/dig-44'])]]);
  });

  test('the same conflict on the same PR head prompts once', async () => {
    // given
    const { auto, sessions, activate, syncTurn } = setup();
    await syncTurn('t1');
    await activate('t1');
    await syncTurn('t1');
    // when
    await activate('t1');
    await auto.check();
    // then
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
  });

  test('a conflict on a new PR head prompts again', async () => {
    // given
    const { auto, sessions, states, activate, syncTurn } = setup();
    await syncTurn('t1');
    await activate('t1');
    await syncTurn('t1');
    states['/wts/dig-44'] = { ...conflicting, headSha: 'b'.repeat(40) };
    // when
    await auto.check();
    // then
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(2);
  });

  test('switching away stops the checks', async () => {
    // given
    const { auto, mergeState, activate } = setup();
    await activate('t1');
    const stopPolling = auto.start();
    // when
    await activate(null);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    stopPolling();
    // then
    expect(mergeState).toHaveBeenCalledTimes(1);
  });

  test('a failed merge state lookup warns and checks the other worktrees', async () => {
    // given
    const tab = { ...cardTab('t1', 'DIG-44', null), worktreePaths: ['/wts/a', '/wts/b'] };
    const { sessions, mergeState, logger, activate, stop } = setup({ tabs: [tab] });
    mergeState.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await stop('t1');
    // when
    await activate('t1');
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'auto-sync failed', {
      operation: 'mergeState',
      worktree: '/wts/a',
      error: 'boom',
    });
    expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44', ['/wts/b']));
  });

  test('start checks the active tab every 2 minutes until stopped', async () => {
    // given
    const { auto, mergeState, activate } = setup();
    await activate('t1');
    // when
    const stopPolling = auto.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = mergeState.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const second = mergeState.mock.calls.length;
    stopPolling();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    // then
    expect([first, second, mergeState.mock.calls.length]).toEqual([1, 2, 2]);
  });

  test('a check that starts while another runs does nothing', async () => {
    // given
    const { auto, mergeState, activate } = setup();
    let release: () => void = () => undefined;
    mergeState.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(conflicting);
          };
        }),
    );
    await activate('t1');
    // when
    await auto.check();
    // then
    expect(mergeState).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
  });

  test('switching tabs during a check checks the new tab and never the hidden one', async () => {
    // given
    const { sessions, mergeState, activate, stop } = setup({
      tabs: [cardTab('t1', 'DIG-44', '/wts/dig-44'), cardTab('t2', 'DIG-45', '/wts/dig-45')],
    });
    await stop('t1');
    await stop('t2');
    let release: () => void = () => undefined;
    mergeState.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(conflicting);
          };
        }),
    );
    await activate('t1');
    await activate('t2');
    // when
    release();
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(sessions.sendPrompt.mock.calls).toEqual([['t2', syncPrompt('DIG-45', ['/wts/dig-45'])]]);
  });

  test('listeners see syncing last when an idle tab is synced', async () => {
    // given
    const { emitted, activate, stop } = setup();
    await stop('t1');
    // when
    await activate('t1');
    // then
    expect(emitted.at(-1)?.sync).toBe('syncing');
  });

  test('a conflicting working tab is queued and sent when it goes idle', async () => {
    // given
    const { sessions, status, syncOf, activate, stop } = setup();
    status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    // when
    await activate('t1');
    const queued = { sync: syncOf('t1'), prompts: sessions.sendPrompt.mock.calls.length };
    await stop('t1');
    // then
    expect(queued).toEqual({ sync: 'queued', prompts: 0 });
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
    expect(syncOf('t1')).toBe('syncing');
  });

  test('syncing clears when the sync turn ends', async () => {
    // given
    const { status, syncOf, activate, stop } = setup();
    await stop('t1');
    await activate('t1');
    status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    // when
    await stop('t1');
    // then
    expect(syncOf('t1')).toBeNull();
  });

  test.each([
    { sync: 'queued', working: true },
    { sync: 'syncing', working: false },
  ])('a $sync tab whose session exits has no sync state', async ({ working }) => {
    // given
    const { sessions, status, syncOf, activate, stop } = setup();
    if (working) {
      status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    } else {
      await stop('t1');
    }
    await activate('t1');
    // when
    sessions.emit('exit', 't1', 0);
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(syncOf('t1')).toBeNull();
  });

  test('a waiting tab with a question prompt open is sent the prompt only after its turn stops', async () => {
    // given
    const { sessions, status, syncOf, activate, stop } = setup();
    await stop('t1');
    status.hook({ tabId: 't1', event: 'Notification', notificationType: 'permission_prompt' });
    // when
    await activate('t1');
    const queued = { sync: syncOf('t1'), prompts: sessions.sendPrompt.mock.calls.length };
    status.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    expect(queued).toEqual({ sync: 'queued', prompts: 0 });
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44', ['/wts/dig-44']));
    });
  });

  test('a waiting tab with failed checks is sent the prompt', async () => {
    // given
    const failing = { ...openPr, checks: { ...openPr.checks, failed: 1 } };
    const { sessions, status, activate, stop } = setup({ prFor: () => Promise.resolve(failing) });
    await stop('t1');
    // when
    await activate('t1');
    // then
    expect(status.statuses()[0]?.dot).toBe('waiting');
    expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44', ['/wts/dig-44']));
  });
});
