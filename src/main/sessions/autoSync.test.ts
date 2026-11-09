import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { syncPrompt } from '@shared/prompts';
import type { Card } from '@shared/types/jira';
import type { PrInfo } from '@shared/types/github';
import type { TabState, TabStatus } from '@shared/types/tabs';
import type { Runner } from '@main/app/preflight';
import { AutoSync, LS_REMOTE_TIMEOUT_MS } from './autoSync';
import type { SessionManager } from './sessions';
import { StatusEngine } from './status';

const cardTab = (id: string, cardKey: string, worktreePath: string | null): TabState => ({
  id,
  projectKey: 'DIG',
  kind: 'card',
  cardKey,
  sessionId: `s-${id}`,
  worktreePath,
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
  checks: { passed: 2, failed: 0, pending: 0, total: 2, runs: [] },
};

type Overrides = {
  tabs?: TabState[];
  getCard?: (key: string) => Promise<Card>;
  prFor?: (worktree: string, projectKey: string) => Promise<PrInfo | null>;
  repoOf?: (worktree: string) => string;
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
  const main: { sha: string; byRepo: Record<string, string> } = { sha: 'aaa', byRepo: {} };
  const repoOf = overrides.repoOf ?? ((worktree: string) => `/repos${worktree}`);
  const commonDir = vi.fn((worktree: string) => Promise.resolve(repoOf(worktree)));
  const run = vi.fn<Runner>((_cmd, _args, cwd) => {
    const sha = main.byRepo[cwd ?? ''] ?? main.sha;
    return Promise.resolve({ code: 0, stdout: `${sha}\trefs/heads/main\n`, stderr: '' });
  });
  const auto = new AutoSync({
    sessions: sessions as unknown as SessionManager,
    status,
    getCard,
    prFor,
    run,
    commonDir,
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
  const lsRemoteCalls = () => run.mock.calls.filter(([, args]) => args.includes('ls-remote'));
  const lsRemotes = () => lsRemoteCalls().length;
  const stop = async (tabId: string) => {
    status.hook({ tabId, event: 'Stop', notificationType: null });
    await vi.waitFor(() => {
      expect(status.statuses().find((s) => s.tabId === tabId)?.dot).not.toBe('working');
    });
  };
  return {
    sessions,
    status,
    auto,
    main,
    run,
    logger,
    getCard,
    emitted,
    syncOf,
    commonDir,
    lsRemoteCalls,
    lsRemotes,
    stop,
  };
}

describe('AutoSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('the first poll records main and sends nothing', async () => {
    // given
    const { auto, sessions, syncOf, lsRemotes } = setup();
    // when
    await auto.poll();
    // then
    expect(lsRemotes()).toBe(1);
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    expect(syncOf('t1')).toBeNull();
  });

  test('a new main sha prompts an idle In Review tab with an open PR and marks it syncing', async () => {
    // given
    const { auto, sessions, main, syncOf, stop } = setup();
    await stop('t1');
    await auto.poll();
    main.sha = 'bbb';
    // when
    await auto.poll();
    // then
    expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44'));
    expect(syncOf('t1')).toBe('syncing');
  });

  test('listeners see syncing last when an idle tab is synced', async () => {
    // given
    const { auto, main, emitted, stop } = setup();
    await stop('t1');
    await auto.poll();
    main.sha = 'bbb';
    // when
    await auto.poll();
    // then
    expect(emitted.at(-1)?.sync).toBe('syncing');
  });

  test.each([
    { case: 'card is In Progress', cardStatus: 'In Progress' as const, pr: openPr, exits: false, tab: undefined },
    { case: 'card is In Review with no PR', cardStatus: 'In Review' as const, pr: null, exits: false, tab: undefined },
    {
      case: 'PR is merged',
      cardStatus: 'In Review' as const,
      pr: { ...openPr, state: 'MERGED' as const },
      exits: false,
      tab: undefined,
    },
    { case: 'session is not alive', cardStatus: 'In Review' as const, pr: openPr, exits: true, tab: undefined },
    {
      case: 'tab has no worktree',
      cardStatus: 'In Review' as const,
      pr: openPr,
      exits: false,
      tab: cardTab('t1', 'DIG-44', null),
    },
    {
      case: 'tab is a planner',
      cardStatus: 'In Review' as const,
      pr: openPr,
      exits: false,
      tab: { ...cardTab('t1', 'DIG-44', '/wts/dig-44'), kind: 'planner' as const, cardKey: null },
    },
  ])('a new main sha skips a tab whose $case', async ({ cardStatus, pr, exits, tab }) => {
    // given
    const { auto, sessions, main, syncOf, stop } = setup({
      tabs: tab === undefined ? undefined : [tab],
      getCard: (key) => Promise.resolve(card(key, cardStatus)),
      prFor: () => Promise.resolve(pr),
    });
    await stop('t1');
    if (exits) {
      sessions.emit('exit', 't1', 0);
    }
    await auto.poll();
    main.sha = 'bbb';
    // when
    await auto.poll();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    expect(syncOf('t1')).toBeNull();
  });

  test('a new main sha queues a working tab and sends when it goes idle', async () => {
    // given
    const { auto, sessions, status, main, syncOf, stop } = setup();
    status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    await auto.poll();
    main.sha = 'bbb';
    // when
    await auto.poll();
    const queued = { sync: syncOf('t1'), prompts: sessions.sendPrompt.mock.calls.length };
    await stop('t1');
    // then
    expect(queued).toEqual({ sync: 'queued', prompts: 0 });
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
    expect(syncOf('t1')).toBe('syncing');
  });

  test('syncing clears when the sync turn ends', async () => {
    // given
    const { auto, status, main, syncOf, stop } = setup();
    await stop('t1');
    await auto.poll();
    main.sha = 'bbb';
    await auto.poll();
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
    const { auto, sessions, status, main, syncOf, stop } = setup();
    if (working) {
      status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    } else {
      await stop('t1');
    }
    await auto.poll();
    main.sha = 'bbb';
    await auto.poll();
    // when
    sessions.emit('exit', 't1', 0);
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(syncOf('t1')).toBeNull();
  });

  test('a new main sha while syncing queues the tab again', async () => {
    // given
    const { auto, sessions, status, main, syncOf, stop } = setup();
    await stop('t1');
    await auto.poll();
    main.sha = 'bbb';
    await auto.poll();
    status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    main.sha = 'ccc';
    // when
    await auto.poll();
    const requeued = syncOf('t1');
    await stop('t1');
    // then
    expect(requeued).toBe('queued');
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(2);
    expect(syncOf('t1')).toBe('syncing');
  });

  test('a new main sha while queued sends one prompt', async () => {
    // given
    const { auto, sessions, status, main, stop } = setup();
    status.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
    await auto.poll();
    main.sha = 'bbb';
    await auto.poll();
    main.sha = 'ccc';
    // when
    await auto.poll();
    await stop('t1');
    // then
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
  });

  test('runs ls-remote once per repo in the repo dir for tabs that share a repo', async () => {
    // given
    const { auto, lsRemoteCalls } = setup({
      tabs: [cardTab('t1', 'DIG-44', '/wts/dig-44'), cardTab('t2', 'DIG-45', '/wts/dig-45')],
      repoOf: () => '/repos/dig',
    });
    // when
    await auto.poll();
    await auto.poll();
    // then
    expect(lsRemoteCalls().map(([, , cwd]) => cwd)).toEqual(['/repos/dig', '/repos/dig']);
  });

  test('looks up the repo once per worktree across polls', async () => {
    // given
    const { auto, commonDir } = setup();
    // when
    await auto.poll();
    await auto.poll();
    // then
    expect(commonDir).toHaveBeenCalledTimes(1);
  });

  test('runs ls-remote with a timeout', async () => {
    // given
    const { auto, lsRemoteCalls } = setup();
    // when
    await auto.poll();
    // then
    expect(lsRemoteCalls()[0]?.[3]).toBe(LS_REMOTE_TIMEOUT_MS);
  });

  test('runs ls-remote with fsmonitor turned off', async () => {
    // given
    const { auto, lsRemoteCalls } = setup();
    // when
    await auto.poll();
    // then
    expect(lsRemoteCalls()[0]?.[1]).toEqual(['-c', 'core.fsmonitor=false', 'ls-remote', 'origin', 'refs/heads/main']);
  });

  test('a waiting tab with a question prompt open is sent the prompt only after its turn stops', async () => {
    // given
    const { auto, sessions, status, main, syncOf, stop } = setup();
    await stop('t1');
    status.hook({ tabId: 't1', event: 'Notification', notificationType: 'permission_prompt' });
    await auto.poll();
    main.sha = 'bbb';
    // when
    await auto.poll();
    const queued = { sync: syncOf('t1'), prompts: sessions.sendPrompt.mock.calls.length };
    status.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    expect(queued).toEqual({ sync: 'queued', prompts: 0 });
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44'));
    });
  });

  test('a waiting tab with failed checks is sent the prompt', async () => {
    // given
    const failing = { ...openPr, checks: { ...openPr.checks, failed: 1 } };
    const { auto, sessions, status, main, stop } = setup({ prFor: () => Promise.resolve(failing) });
    await stop('t1');
    await auto.poll();
    main.sha = 'bbb';
    // when
    await auto.poll();
    // then
    expect(status.statuses()[0]?.dot).toBe('waiting');
    expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44'));
  });

  test('a new main sha syncs only the tabs of the repo whose main moved', async () => {
    // given
    const { auto, sessions, main, stop } = setup({
      tabs: [cardTab('t1', 'DIG-44', '/wts/dig-44'), cardTab('t2', 'BEAR-1', '/wts/bear-1')],
    });
    await stop('t1');
    await stop('t2');
    await auto.poll();
    main.byRepo['/repos/wts/bear-1'] = 'bbb';
    // when
    await auto.poll();
    // then
    expect(sessions.sendPrompt.mock.calls).toEqual([['t2', syncPrompt('BEAR-1')]]);
  });

  test('an unchanged sha sends nothing', async () => {
    // given
    const { auto, sessions, getCard, stop } = setup();
    await stop('t1');
    await auto.poll();
    getCard.mockClear();
    // when
    await auto.poll();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    expect(getCard).not.toHaveBeenCalled();
  });

  test('a failed ls-remote warns and leaves the repo baseline unchanged', async () => {
    // given
    const { auto, sessions, main, run, logger, stop } = setup();
    await stop('t1');
    await auto.poll();
    run.mockImplementationOnce(() => Promise.resolve({ code: 128, stdout: '', stderr: 'fatal: no remote' }));
    main.sha = 'bbb';
    // when
    await auto.poll();
    const promptsAfterFailure = sessions.sendPrompt.mock.calls.length;
    await auto.poll();
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'auto-sync failed', {
      operation: 'ls-remote',
      repo: '/repos/wts/dig-44',
      error: 'reading main: fatal: no remote',
    });
    expect(promptsAfterFailure).toBe(0);
    expect(sessions.sendPrompt).toHaveBeenCalledWith('t1', syncPrompt('DIG-44'));
  });

  test('a failed repo lookup warns and skips only that worktree', async () => {
    // given
    const { auto, commonDir, logger, lsRemotes } = setup({
      tabs: [cardTab('t1', 'DIG-44', '/wts/gone'), cardTab('t2', 'DIG-45', '/wts/dig-45')],
    });
    commonDir.mockImplementationOnce(() => Promise.reject(new Error('running git rev-parse: not a git repository')));
    // when
    await auto.poll();
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'auto-sync failed', {
      operation: 'rev-parse',
      worktree: '/wts/gone',
      error: 'running git rev-parse: not a git repository',
    });
    expect(lsRemotes()).toBe(1);
  });

  test.each([
    { operation: 'getCard', failCard: true, failPr: false },
    { operation: 'prFor', failCard: false, failPr: true },
  ])('a failed $operation warns and skips only that tab', async ({ operation, failCard, failPr }) => {
    // given
    const fails = (key: string, fail: boolean) => fail && key === 'DIG-44';
    const { auto, sessions, main, logger, stop } = setup({
      tabs: [cardTab('t1', 'DIG-44', '/wts/dig-44'), cardTab('t2', 'DIG-45', '/wts/dig-45')],
      repoOf: () => '/repos/dig',
      getCard: (key) =>
        fails(key, failCard) ? Promise.reject(new Error('reading card: 500')) : Promise.resolve(card(key)),
      prFor: (worktree) =>
        fails(worktree === '/wts/dig-44' ? 'DIG-44' : '', failPr)
          ? Promise.reject(new Error('reading card: 500'))
          : Promise.resolve(openPr),
    });
    await stop('t1');
    await stop('t2');
    await auto.poll();
    logger.warn.mockClear();
    main.sha = 'bbb';
    // when
    await auto.poll();
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'auto-sync failed', {
      operation,
      worktree: '/wts/dig-44',
      error: 'reading card: 500',
    });
    expect(sessions.sendPrompt.mock.calls).toEqual([['t2', syncPrompt('DIG-45')]]);
  });

  test('start polls right away and every 2 minutes until stopped', async () => {
    // given
    const { auto, lsRemotes } = setup();
    // when
    const stop = auto.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = lsRemotes();
    await vi.advanceTimersByTimeAsync(120_000);
    const second = lsRemotes();
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    // then
    expect([first, second, lsRemotes()]).toEqual([1, 2, 2]);
  });

  test('a poll that starts while another runs does nothing', async () => {
    // given
    const { auto, run, lsRemotes } = setup();
    let release: () => void = () => undefined;
    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ code: 0, stdout: 'aaa\trefs/heads/main\n', stderr: '' });
          };
        }),
    );
    const first = auto.poll();
    await vi.advanceTimersByTimeAsync(0);
    // when
    await auto.poll();
    // then
    expect(lsRemotes()).toBe(1);
    release();
    await first;
  });
});
