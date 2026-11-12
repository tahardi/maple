import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { QueuedCard } from '@shared/types/queue/queueState';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import type { SessionManager } from './SessionManager';
import type { StatusEngine } from './StatusEngine';
import { RECHECK_MS, StartQueue, type HostLoad, type StartLimits } from './StartQueue';

const GIB = 1024 ** 3;

function tab(projectKey: string, cardKey: string): TabState {
  return {
    id: `tab-${cardKey}`,
    projectKey,
    kind: 'card',
    cardKey,
    sessionId: `s-${cardKey}`,
    worktreePath: null,
    worktreePaths: [],
  };
}

function status(tabId: string, dot: Dot): TabStatus {
  return { tabId, dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null };
}

function working(count: number): TabStatus[] {
  return Array.from({ length: count }, (_, i) => status(`w${String(i)}`, 'working'));
}

function queued(...keys: string[]): QueuedCard[] {
  return keys.map((cardKey) => ({ projectKey: 'DIG', cardKey }));
}

type Setup = { queued?: QueuedCard[]; working?: number; load?: Partial<HostLoad>; limits?: Partial<StartLimits> };

function setup(given: Setup = {}) {
  const tabs: TabState[] = [];
  let statuses = working(given.working ?? 0);
  const engine = Object.assign(new EventEmitter(), { statuses: () => statuses });
  const startCard = vi.fn((projectKey: string, cardKey: string) => {
    const opened = tab(projectKey, cardKey);
    tabs.push(opened);
    statuses = [...statuses, status(opened.id, 'working')];
    return opened;
  });
  const sessions = Object.assign(new EventEmitter(), { startCard, list: () => tabs });
  const load: HostLoad = { loadAverage: 1, cores: 8, freeBytes: 8 * GIB, ...given.load };
  const save = vi.fn<(cards: QueuedCard[]) => Promise<void>>(() => Promise.resolve());
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const limits: StartLimits = {
    startAtOnce: 4,
    maxWorking: 8,
    maxLoadPerCore: 0.8,
    minFreeMegabytes: 2048,
    startGapSeconds: 15,
    ...given.limits,
  };
  const queue = new StartQueue({
    sessions: sessions as unknown as SessionManager,
    status: engine as unknown as StatusEngine,
    limits: () => limits,
    load: () => load,
    queued: given.queued ?? [],
    save,
    logger,
  });
  const setWorking = (count: number) => {
    statuses = working(count);
    engine.emit('status', status('w0', 'idle'), 'working');
  };
  return { queue, sessions, engine, startCard, save, logger, load, limits, tabs, setWorking };
}

describe('StartQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('add starts the card at once when there is room and nothing is queued', () => {
    // given
    const { queue, startCard } = setup();
    // when
    const result = queue.add('DIG', 'DIG-45');
    // then
    expect(result).toEqual(tab('DIG', 'DIG-45'));
    expect(startCard).toHaveBeenCalledWith('DIG', 'DIG-45');
    expect(queue.state().cards).toEqual([]);
  });

  test.each([
    {
      name: '6 tabs are working with a ceiling of 6',
      working: 6,
      load: {},
      maxWorking: 6,
      waitingFor: 'room',
      limit: 6,
    },
    {
      name: 'the load average is at 0.8 per core',
      working: 0,
      load: { loadAverage: 6.4, cores: 8 },
      maxWorking: 8,
      waitingFor: 'cpu',
      limit: 8,
    },
    {
      name: 'free memory is under the floor',
      working: 0,
      load: { freeBytes: 1 * GIB },
      maxWorking: 8,
      waitingFor: 'memory',
      limit: 8,
    },
  ])('add queues the card when $name', ({ working: count, load, maxWorking, waitingFor, limit }) => {
    // given
    const { queue, startCard } = setup({ working: count, load, limits: { maxWorking } });
    // when
    const result = queue.add('DIG', 'DIG-45');
    // then
    expect(result).toBeNull();
    expect(startCard).not.toHaveBeenCalled();
    expect(queue.state()).toEqual({
      cards: [{ projectKey: 'DIG', cardKey: 'DIG-45' }],
      working: count,
      limit,
      waitingFor,
      gapSeconds: 15,
      failure: null,
    });
  });

  test('starts one card past startAtOnce when CPU and memory have room', () => {
    // given
    const { queue, startCard } = setup({ working: 4 });
    // when
    const result = queue.add('DIG', 'DIG-45');
    // then
    expect(result).toEqual(tab('DIG', 'DIG-45'));
    expect(startCard).toHaveBeenCalledWith('DIG', 'DIG-45');
  });

  test('waits the start gap between starts past startAtOnce', () => {
    // given
    const { queue, startCard } = setup({ working: 4 });
    queue.start();
    queue.add('DIG', 'DIG-45');
    // when
    const second = queue.add('DIG', 'DIG-46');
    // then
    expect(second).toBeNull();
    expect(queue.state()).toMatchObject({ cards: queued('DIG-46'), waitingFor: 'pace' });
    // when
    vi.advanceTimersByTime(15_000);
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
    expect(queue.state().cards).toEqual([]);
  });

  test('starts below startAtOnce without waiting for the start gap when nothing is queued', () => {
    // given
    const { queue, startCard } = setup({ working: 0 });
    queue.start();
    // when
    const results = ['DIG-45', 'DIG-46', 'DIG-47', 'DIG-48', 'DIG-49'].map((key) => queue.add('DIG', key));
    // then
    expect(startCard).toHaveBeenCalledTimes(4);
    expect(results[4]).toBeNull();
    expect(queue.state()).toMatchObject({ cards: queued('DIG-49'), waitingFor: 'pace' });
  });

  test('a queued card waits the start gap even below startAtOnce', () => {
    // given
    const { queue, startCard, setWorking } = setup({ working: 4 });
    queue.add('DIG', 'DIG-44');
    vi.advanceTimersByTime(1_000);
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    setWorking(2);
    startCard.mockClear();
    // when
    queue.start();
    // then
    expect(startCard).not.toHaveBeenCalled();
    expect(queue.state()).toMatchObject({ cards: queued('DIG-45', 'DIG-46'), waitingFor: 'pace' });
    // when
    vi.advanceTimersByTime(14_000);
    // then
    expect(startCard.mock.calls).toEqual([['DIG', 'DIG-45']]);
  });

  test('cards waiting for room start one start gap apart once room opens', () => {
    // given
    const { queue, startCard, setWorking } = setup({ limits: { maxWorking: 1, startGapSeconds: 300 } });
    queue.start();
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    queue.add('DIG', 'DIG-47');
    vi.advanceTimersByTime(10_000);
    // when
    setWorking(0);
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    expect(queue.state()).toMatchObject({ cards: queued('DIG-46', 'DIG-47'), waitingFor: 'pace' });
    // when
    vi.advanceTimersByTime(290_000);
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
    // when
    setWorking(0);
    vi.advanceTimersByTime(299_999);
    // then
    expect(startCard).toHaveBeenCalledTimes(2);
    // when
    vi.advanceTimersByTime(1);
    // then
    expect(startCard).toHaveBeenCalledTimes(3);
  });

  test('a saved queue starts its first card at once and then one per start gap', () => {
    // given
    const { queue, startCard } = setup({
      queued: queued('DIG-41', 'DIG-42', 'DIG-43', 'DIG-44', 'DIG-45', 'DIG-46', 'DIG-47', 'DIG-48'),
    });
    // when
    queue.start();
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    expect(queue.state().waitingFor).toBe('pace');
    // when
    vi.advanceTimersByTime(14_999);
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    // when
    vi.advanceTimersByTime(1);
    // then
    expect(startCard).toHaveBeenCalledTimes(2);
    // when
    vi.advanceTimersByTime(15_000);
    // then
    expect(startCard).toHaveBeenCalledTimes(3);
  });

  test('starts the next card one start gap after an extra start made partway through a recheck period', () => {
    // given
    const { queue, startCard } = setup({ working: 4 });
    queue.start();
    vi.advanceTimersByTime(5_000);
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    // when
    vi.advanceTimersByTime(14_999);
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    // when
    vi.advanceTimersByTime(1);
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
  });

  test('a 90 second start gap waits 90 seconds and reports the gap', () => {
    // given
    const { queue, startCard } = setup({ working: 4, limits: { startGapSeconds: 90 } });
    queue.start();
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    // when
    vi.advanceTimersByTime(89_999);
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    expect(queue.state()).toMatchObject({ waitingFor: 'pace', gapSeconds: 90 });
    // when
    vi.advanceTimersByTime(1);
    // then
    expect(startCard).toHaveBeenCalledTimes(2);
  });

  test('a start gap that grows while a card waits holds the start until the new gap', () => {
    // given
    const { queue, startCard, limits } = setup({ working: 4 });
    queue.start();
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    limits.startGapSeconds = 90;
    // when
    vi.advanceTimersByTime(89_999);
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    expect(queue.state()).toMatchObject({ waitingFor: 'pace', gapSeconds: 90 });
    // when
    vi.advanceTimersByTime(1);
    // then
    expect(startCard).toHaveBeenCalledTimes(2);
  });

  test('a start gap that shrinks while a card waits starts it on the next recheck', () => {
    // given
    const { queue, startCard, limits } = setup({ working: 4, limits: { startGapSeconds: 90 } });
    queue.start();
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    limits.startGapSeconds = 15;
    // when
    vi.advanceTimersByTime(RECHECK_MS);
    // then
    expect(startCard).toHaveBeenCalledTimes(2);
    expect(queue.state().cards).toEqual([]);
  });

  test('a long start gap still rechecks CPU and memory every 15 seconds', () => {
    // given
    const { queue, startCard, load } = setup({
      load: { loadAverage: 8 },
      queued: queued('DIG-45'),
      limits: { startGapSeconds: 90 },
    });
    queue.start();
    load.loadAverage = 1;
    // when
    vi.advanceTimersByTime(RECHECK_MS);
    // then
    expect(startCard).toHaveBeenCalledWith('DIG', 'DIG-45');
  });

  test.each([
    { name: 'the load average is at 0.8 per core', load: { loadAverage: 6.4, cores: 8 }, waitingFor: 'cpu' },
    { name: 'free memory is under the floor', load: { freeBytes: 1 * GIB }, waitingFor: 'memory' },
  ])('stops starting past startAtOnce when $name', ({ load, waitingFor }) => {
    // given
    const { queue, startCard } = setup({ working: 4, load });
    // when
    const result = queue.add('DIG', 'DIG-45');
    // then
    expect(result).toBeNull();
    expect(startCard).not.toHaveBeenCalled();
    expect(queue.state()).toMatchObject({ cards: queued('DIG-45'), waitingFor });
  });

  test('never starts past maxWorking', () => {
    // given
    const { queue, startCard } = setup({ working: 6, limits: { maxWorking: 6 } });
    queue.start();
    // when
    const result = queue.add('DIG', 'DIG-45');
    vi.advanceTimersByTime(RECHECK_MS * 4);
    // then
    expect(result).toBeNull();
    expect(startCard).not.toHaveBeenCalled();
    expect(queue.state()).toMatchObject({ working: 6, limit: 6, waitingFor: 'room' });
  });

  test('add returns the open tab of a card that is already open even when there is no room', () => {
    // given
    const { queue, tabs, startCard } = setup({ working: 4, limits: { maxWorking: 4 } });
    tabs.push(tab('DIG', 'DIG-45'));
    // when
    const result = queue.add('DIG', 'DIG-45');
    // then
    expect(result).toEqual(tab('DIG', 'DIG-45'));
    expect(startCard).not.toHaveBeenCalled();
    expect(queue.state().cards).toEqual([]);
  });

  test('add queues a card only once', () => {
    // given
    const { queue } = setup({ working: 4, limits: { maxWorking: 4 } });
    queue.add('DIG', 'DIG-45');
    // when
    queue.add('DIG', 'DIG-45');
    // then
    expect(queue.state().cards).toEqual(queued('DIG-45'));
  });

  test('add saves the queue and emits changed with the new state', () => {
    // given
    const { queue, save } = setup({ working: 4, limits: { maxWorking: 4 } });
    const changed = vi.fn();
    queue.on('changed', changed);
    // when
    queue.add('DIG', 'DIG-45');
    // then
    expect(save).toHaveBeenCalledWith(queued('DIG-45'));
    expect(changed).toHaveBeenLastCalledWith(queue.state());
  });

  test('starts queued cards in order once a working tab stops', () => {
    // given
    const { queue, startCard, setWorking } = setup({
      working: 4,
      limits: { maxWorking: 4 },
      queued: queued('DIG-45', 'DIG-46'),
    });
    queue.start();
    // when
    setWorking(3);
    // then
    expect(startCard.mock.calls).toEqual([['DIG', 'DIG-45']]);
    expect(queue.state().cards).toEqual(queued('DIG-46'));
  });

  test('starts a queued card when the timer finds the load has dropped', () => {
    // given
    const { queue, startCard, load } = setup({ load: { loadAverage: 8 }, queued: queued('DIG-45') });
    queue.start();
    load.loadAverage = 1;
    // when
    vi.advanceTimersByTime(RECHECK_MS);
    // then
    expect(startCard).toHaveBeenCalledWith('DIG', 'DIG-45');
  });

  test('starts a queued card when a tab closes', () => {
    // given
    const { queue, sessions, startCard, load } = setup({ load: { freeBytes: 0 }, queued: queued('DIG-45') });
    queue.start();
    load.freeBytes = 8 * GIB;
    // when
    sessions.emit('changed', []);
    // then
    expect(startCard).toHaveBeenCalledWith('DIG', 'DIG-45');
  });

  test('starts nothing before start is called', () => {
    // given
    const { sessions, startCard, setWorking } = setup({ queued: queued('DIG-45') });
    // when
    setWorking(0);
    sessions.emit('changed', []);
    vi.advanceTimersByTime(RECHECK_MS);
    // then
    expect(startCard).not.toHaveBeenCalled();
  });

  test('starts the cards restored from state once started', () => {
    // given
    const { queue, startCard, save } = setup({ queued: queued('DIG-45', 'DIG-46') });
    // when
    queue.start();
    vi.advanceTimersByTime(15_000);
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
    expect(queue.state().cards).toEqual([]);
    expect(save).toHaveBeenLastCalledWith([]);
  });

  test('a failed queued start drops the card, keeps starting KEY: reason as the failure, and starts the next', () => {
    // given
    const { queue, startCard, logger } = setup({ queued: queued('DIG-45', 'DIG-46') });
    startCard.mockImplementationOnce(() => {
      throw new Error('no worktree');
    });
    // when
    queue.start();
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
    expect(queue.state().failure).toBe('starting DIG-45: no worktree');
    expect(queue.state().cards).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('session', 'queued start failed', {
      cardKey: 'DIG-45',
      error: 'no worktree',
    });
  });

  test('a new add clears the last failure', () => {
    // given
    const { queue, startCard } = setup({ queued: queued('DIG-45') });
    startCard.mockImplementationOnce(() => {
      throw new Error('no worktree');
    });
    queue.start();
    // when
    queue.add('DIG', 'DIG-46');
    // then
    expect(queue.state().failure).toBeNull();
  });

  test('add starts waiting cards in order when there is room again', () => {
    // given
    const { queue, startCard, load } = setup({ load: { freeBytes: 0 }, queued: queued('DIG-45') });
    queue.start();
    load.freeBytes = 8 * GIB;
    // when
    queue.add('DIG', 'DIG-46');
    vi.advanceTimersByTime(15_000);
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
    expect(queue.state().cards).toEqual([]);
  });

  test('a start that emits status during a pass starts each card once up to the limit', () => {
    // given
    const { queue, engine, startCard, save } = setup({
      working: 2,
      limits: { maxWorking: 4 },
      queued: queued('DIG-45', 'DIG-46', 'DIG-47'),
    });
    const changed = vi.fn();
    queue.on('changed', changed);
    const spawn = startCard.getMockImplementation();
    startCard.mockImplementation((projectKey: string, cardKey: string) => {
      const opened = spawn?.(projectKey, cardKey) ?? tab(projectKey, cardKey);
      engine.emit('status', status(opened.id, 'working'), 'idle');
      return opened;
    });
    // when
    queue.start();
    vi.advanceTimersByTime(15_000);
    // then
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-45'],
      ['DIG', 'DIG-46'],
    ]);
    expect(queue.state().cards).toEqual(queued('DIG-47'));
    expect(save).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  test('a failed save is logged at error', async () => {
    // given
    const { queue, save, logger } = setup({ working: 4, limits: { maxWorking: 4 } });
    save.mockRejectedValueOnce(new Error('disk full'));
    // when
    queue.add('DIG', 'DIG-45');
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalled();
    });
    // then
    expect(logger.error).toHaveBeenCalledWith('session', 'failed', { operation: 'saveQueue', error: 'disk full' });
  });

  test('a change in the working count emits changed without saving', () => {
    // given
    const { queue, save, setWorking } = setup({ working: 4, limits: { maxWorking: 4 }, queued: queued('DIG-45') });
    queue.start();
    save.mockClear();
    const changed = vi.fn();
    queue.on('changed', changed);
    // when
    setWorking(5);
    // then
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ working: 5 }));
    expect(save).not.toHaveBeenCalled();
  });

  test('queueing a card and starting it from the queue are logged at info', () => {
    // given
    const { queue, logger, setWorking } = setup({ working: 4, limits: { maxWorking: 4 } });
    queue.start();
    queue.add('DIG', 'DIG-45');
    // when
    setWorking(0);
    // then
    expect(logger.info).toHaveBeenCalledWith('session', 'queued', { cardKey: 'DIG-45' });
    expect(logger.info).toHaveBeenCalledWith('session', 'queued start', { cardKey: 'DIG-45' });
  });

  test.each([
    {
      name: 'remove',
      act: (q: StartQueue) => {
        q.remove('DIG-99');
      },
    },
    {
      name: 'move',
      act: (q: StartQueue) => {
        q.move('DIG-99', 0);
      },
    },
  ])('$name of a card not in the queue changes nothing', ({ act }) => {
    // given
    const { queue, save } = setup({ working: 4, limits: { maxWorking: 4 }, queued: queued('DIG-45') });
    const changed = vi.fn();
    queue.on('changed', changed);
    // when
    act(queue);
    // then
    expect(queue.state().cards).toEqual(queued('DIG-45'));
    expect(save).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  test('remove drops a waiting card and saves', () => {
    // given
    const { queue, save } = setup({ working: 4, limits: { maxWorking: 4 }, queued: queued('DIG-45', 'DIG-46') });
    // when
    queue.remove('DIG-45');
    // then
    expect(queue.state().cards).toEqual(queued('DIG-46'));
    expect(save).toHaveBeenLastCalledWith(queued('DIG-46'));
  });

  test.each([
    { name: 'DIG-46 up one', cardKey: 'DIG-46', index: 0, want: ['DIG-46', 'DIG-45', 'DIG-47'] },
    { name: 'DIG-46 down one', cardKey: 'DIG-46', index: 2, want: ['DIG-45', 'DIG-47', 'DIG-46'] },
    { name: 'the last card to the front', cardKey: 'DIG-47', index: 0, want: ['DIG-47', 'DIG-45', 'DIG-46'] },
    { name: 'the first card to the end', cardKey: 'DIG-45', index: 2, want: ['DIG-46', 'DIG-47', 'DIG-45'] },
    { name: 'past the end stays put', cardKey: 'DIG-47', index: 3, want: ['DIG-45', 'DIG-46', 'DIG-47'] },
  ])('move $name', ({ cardKey, index, want }) => {
    // given
    const { queue } = setup({
      working: 4,
      limits: { maxWorking: 4 },
      queued: queued('DIG-45', 'DIG-46', 'DIG-47'),
    });
    // when
    queue.move(cardKey, index);
    // then
    expect(queue.state().cards).toEqual(queued(...want));
  });

  test('stop ends the timer and stops listening', () => {
    // given
    const { queue, sessions, startCard, setWorking, load } = setup({
      working: 4,
      limits: { maxWorking: 4 },
      queued: queued('DIG-45'),
    });
    const stop = queue.start();
    // when
    stop();
    setWorking(0);
    sessions.emit('changed', []);
    load.loadAverage = 0;
    vi.advanceTimersByTime(RECHECK_MS);
    // then
    expect(startCard).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('stop clears a pending pace recheck', () => {
    // given
    const { queue, startCard } = setup({ working: 4 });
    const stop = queue.start();
    vi.advanceTimersByTime(5_000);
    queue.add('DIG', 'DIG-45');
    queue.add('DIG', 'DIG-46');
    // when
    stop();
    // then
    expect(vi.getTimerCount()).toBe(0);
    expect(startCard).toHaveBeenCalledTimes(1);
  });
});
