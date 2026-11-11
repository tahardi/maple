import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { QueuedCard } from '@shared/types/queue';
import type { Dot, TabState, TabStatus } from '@shared/types/tabs';
import type { SessionManager } from './sessions';
import type { StatusEngine } from './status';
import { RECHECK_MS, StartQueue, type HostLoad } from './startQueue';

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

type Setup = { queued?: QueuedCard[]; working?: number; load?: Partial<HostLoad> };

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
  const queue = new StartQueue({
    sessions: sessions as unknown as SessionManager,
    status: engine as unknown as StatusEngine,
    limits: () => ({ maxWorking: 4, maxLoadPerCore: 0.8, minFreeMegabytes: 2048 }),
    load: () => load,
    queued: given.queued ?? [],
    save,
    logger,
  });
  const setWorking = (count: number) => {
    statuses = working(count);
    engine.emit('status', status('w0', 'idle'), 'working');
  };
  return { queue, sessions, startCard, save, logger, load, tabs, setWorking };
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
    { name: '4 tabs are working', working: 4, load: {}, waitingFor: 'room' },
    {
      name: 'the load average is at 0.8 per core',
      working: 0,
      load: { loadAverage: 6.4, cores: 8 },
      waitingFor: 'cpu',
    },
    { name: 'free memory is under the floor', working: 0, load: { freeBytes: 1 * GIB }, waitingFor: 'memory' },
  ])('add queues the card when $name', ({ working: count, load, waitingFor }) => {
    // given
    const { queue, startCard } = setup({ working: count, load });
    // when
    const result = queue.add('DIG', 'DIG-45');
    // then
    expect(result).toBeNull();
    expect(startCard).not.toHaveBeenCalled();
    expect(queue.state()).toEqual({
      cards: [{ projectKey: 'DIG', cardKey: 'DIG-45' }],
      working: count,
      limit: 4,
      waitingFor,
      failure: null,
    });
  });

  test('add returns the open tab of a card that is already open even when there is no room', () => {
    // given
    const { queue, tabs, startCard } = setup({ working: 4 });
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
    const { queue } = setup({ working: 4 });
    queue.add('DIG', 'DIG-45');
    // when
    queue.add('DIG', 'DIG-45');
    // then
    expect(queue.state().cards).toEqual(queued('DIG-45'));
  });

  test('add saves the queue and emits changed with the new state', () => {
    // given
    const { queue, save } = setup({ working: 4 });
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
    const { queue, startCard, setWorking } = setup({ working: 4, queued: queued('DIG-45', 'DIG-46') });
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

  test('remove drops a waiting card and saves', () => {
    // given
    const { queue, save } = setup({ working: 4, queued: queued('DIG-45', 'DIG-46') });
    // when
    queue.remove('DIG-45');
    // then
    expect(queue.state().cards).toEqual(queued('DIG-46'));
    expect(save).toHaveBeenLastCalledWith(queued('DIG-46'));
  });

  test.each([
    { name: 'DIG-46 up', cardKey: 'DIG-46', offset: -1 as const, want: ['DIG-46', 'DIG-45', 'DIG-47'] },
    { name: 'DIG-46 down', cardKey: 'DIG-46', offset: 1 as const, want: ['DIG-45', 'DIG-47', 'DIG-46'] },
    {
      name: 'the first card up stays put',
      cardKey: 'DIG-45',
      offset: -1 as const,
      want: ['DIG-45', 'DIG-46', 'DIG-47'],
    },
    {
      name: 'the last card down stays put',
      cardKey: 'DIG-47',
      offset: 1 as const,
      want: ['DIG-45', 'DIG-46', 'DIG-47'],
    },
  ])('move $name', ({ cardKey, offset, want }) => {
    // given
    const { queue } = setup({ working: 4, queued: queued('DIG-45', 'DIG-46', 'DIG-47') });
    // when
    queue.move(cardKey, offset);
    // then
    expect(queue.state().cards).toEqual(queued(...want));
  });

  test('stop ends the timer and stops listening', () => {
    // given
    const { queue, sessions, startCard, setWorking, load } = setup({ working: 4, queued: queued('DIG-45') });
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
});
