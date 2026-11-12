import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TabState, TabStatus } from '@shared/types/tabs';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import { EventRecorder } from './EventRecorder';

const cardTab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: 'MPL-1',
  sessionId: 's1',
  worktreePath: '/wts/mpl-1',
  worktreePaths: [],
};

const plannerTab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'planner',
  cardKey: null,
  sessionId: 's1',
  worktreePath: null,
  worktreePaths: [],
};

const refs = { project: 'MPL', card: 'MPL-1', tab: 't1', session: 's1' };

const failedStatus: TabStatus = {
  tabId: 't1',
  dot: 'idle',
  sessionAlive: false,
  exitCode: 1,
  resumeFailed: true,
  sync: null,
};

function setup(tab: TabState = cardTab) {
  const sessions = Object.assign(new EventEmitter(), { get: vi.fn((): TabState | null => tab) });
  const status = new EventEmitter();
  const log = { append: vi.fn((): Promise<void> => Promise.resolve()) };
  const transcriptOffset = vi.fn((): Promise<number | null> => Promise.resolve(null));
  const headSha = vi.fn((): Promise<string> => Promise.resolve('abc123'));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const recorder = new EventRecorder({
    sessions: sessions as unknown as SessionManager,
    status: status as unknown as StatusEngine,
    log,
    transcriptOffset,
    headSha,
    logger,
  });
  return { sessions, status, log, transcriptOffset, headSha, logger, recorder };
}

type Harness = ReturnType<typeof setup>;

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function types(log: Harness['log']): unknown[] {
  return (log.append.mock.calls as unknown[][]).map((call) => call[0]);
}

describe('EventRecorder', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    {
      type: 'session.spawn',
      name: 'spawn',
      act: ({ sessions }: Harness) => sessions.emit('spawn', 't1', true, false),
      data: { prompted: true, resumed: false },
    },
    {
      type: 'session.exit',
      name: 'exit',
      act: ({ sessions }: Harness) => sessions.emit('exit', 't1', 1),
      data: { exitCode: 1 },
    },
    {
      type: 'session.interrupt',
      name: 'interrupt',
      act: ({ sessions }: Harness) => sessions.emit('interrupt', 't1'),
      data: {},
    },
    {
      type: 'prompt.submitted',
      name: 'the UserPromptSubmit hook',
      act: ({ recorder }: Harness) => {
        recorder.hook({ tabId: 't1', event: 'UserPromptSubmit', notificationType: null });
      },
      data: {},
    },
    {
      type: 'permission.prompt',
      name: 'the Notification hook',
      act: ({ recorder }: Harness) => {
        recorder.hook({ tabId: 't1', event: 'Notification', notificationType: 'permission_prompt' });
      },
      data: {},
    },
  ])('records $type from $name', async ({ type, act, data }) => {
    // given
    const harness = setup();
    harness.sessions.emit('spawn', 't1', false, false);
    // when
    act(harness);
    // then
    await vi.waitFor(() => {
      expect(harness.log.append).toHaveBeenCalledWith(type, refs, data);
    });
  });

  test('skips a Notification that is not a permission prompt', async () => {
    // given
    const { sessions, recorder, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Notification', notificationType: 'idle_prompt' });
    await settle();
    // then
    expect(types(log)).toEqual(['session.spawn']);
  });

  test('records session.stop with the transcript offset, HEAD, and background tasks', async () => {
    // given
    const { sessions, recorder, log, transcriptOffset, headSha } = setup();
    transcriptOffset.mockResolvedValue(120);
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null, sessionId: 's2', backgroundTasks: ['shell'] });
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith(
        'session.stop',
        { ...refs, session: 's2' },
        { transcript: { session: 's2', offset: 120 }, head: 'abc123', backgroundTasks: ['shell'] },
      );
    });
    expect(headSha).toHaveBeenCalledWith('/wts/mpl-1');
  });

  test('records session.start with the source and transcript offset', async () => {
    // given
    const { sessions, recorder, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'SessionStart', notificationType: null, sessionId: 's2', source: 'clear' });
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith(
        'session.start',
        { ...refs, session: 's2' },
        { source: 'clear', transcript: null },
      );
    });
  });

  test('records a null head for a tab without a worktree', async () => {
    // given
    const { sessions, recorder, log, headSha } = setup(plannerTab);
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith(
        'session.stop',
        { ...refs, card: null },
        { transcript: null, head: null, backgroundTasks: [] },
      );
    });
    expect(headSha).not.toHaveBeenCalled();
  });

  test('records a null head when git fails', async () => {
    // given
    const { sessions, recorder, log, headSha, logger } = setup();
    headSha.mockRejectedValue(new Error('running git'));
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.stop', refs, {
        transcript: null,
        head: null,
        backgroundTasks: [],
      });
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'events',
      'failed',
      expect.objectContaining({ operation: 'recording event', type: 'session.stop', error: 'running git' }),
    );
  });

  test('records session.resumeFailed once until the tab spawns again', async () => {
    // given
    const { sessions, status, log } = setup();
    sessions.emit('spawn', 't1', false, true);
    // when
    status.emit('status', failedStatus, 'working');
    status.emit('status', failedStatus, 'idle');
    await settle();
    const before = types(log).filter((type) => type === 'session.resumeFailed').length;
    sessions.emit('spawn', 't1', false, true);
    status.emit('status', failedStatus, 'working');
    await settle();
    // then
    expect(before).toBe(1);
    expect(types(log).filter((type) => type === 'session.resumeFailed')).toHaveLength(2);
    expect(log.append).toHaveBeenCalledWith('session.resumeFailed', refs, { exitCode: 1 });
  });

  test('keeps the tab fields for an exit after the tab closed', async () => {
    // given
    const { sessions, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    sessions.get.mockReturnValue(null);
    sessions.emit('changed', []);
    // when
    sessions.emit('exit', 't1', 0);
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.exit', refs, { exitCode: 0 });
    });
  });

  test('reads HEAD from a worktree set after the spawn', async () => {
    // given
    const { sessions, recorder, headSha } = setup({ ...cardTab, worktreePath: null });
    sessions.emit('spawn', 't1', true, false);
    sessions.emit('changed', [cardTab]);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(headSha).toHaveBeenCalledWith('/wts/mpl-1');
    });
  });

  test('ignores a changed tab it never saw', async () => {
    // given
    const { sessions, log } = setup();
    sessions.emit('changed', [cardTab]);
    // when
    sessions.emit('exit', 't1', 0);
    await settle();
    // then
    expect(log.append).not.toHaveBeenCalled();
  });

  test('uses the new session id after a respawn', async () => {
    // given
    const { sessions, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    sessions.get.mockReturnValue({ ...cardTab, sessionId: 's9' });
    sessions.emit('spawn', 't1', true, false);
    // when
    sessions.emit('exit', 't1', 0);
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.exit', { ...refs, session: 's9' }, { exitCode: 0 });
    });
  });

  test('records nothing for a spawn whose tab is gone', async () => {
    // given
    const { sessions, log } = setup();
    sessions.get.mockReturnValue(null);
    // when
    sessions.emit('spawn', 't1', false, false);
    await settle();
    // then
    expect(log.append).not.toHaveBeenCalled();
  });

  test('uses the tab session for the transcript when the hook has none', async () => {
    // given
    const { sessions, recorder, log, transcriptOffset } = setup();
    transcriptOffset.mockResolvedValue(0);
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null, sessionId: null });
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.stop', refs, {
        transcript: { session: 's1', offset: 0 },
        head: 'abc123',
        backgroundTasks: [],
      });
    });
    expect(transcriptOffset).toHaveBeenCalledWith('s1');
  });

  test('records a null source for a SessionStart without one', async () => {
    // given
    const { sessions, recorder, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'SessionStart', notificationType: null });
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.start', refs, { source: null, transcript: null });
    });
  });

  test('records no resume failure for a status without one', async () => {
    // given
    const { sessions, status, log } = setup();
    sessions.emit('spawn', 't1', false, true);
    // when
    status.emit('status', { ...failedStatus, resumeFailed: false }, 'working');
    await settle();
    // then
    expect(types(log)).toEqual(['session.spawn']);
  });

  test('tracks resume failures per tab', async () => {
    // given
    const { sessions, status, log } = setup();
    sessions.emit('spawn', 't1', false, true);
    sessions.get.mockReturnValue({ ...cardTab, id: 't2' });
    sessions.emit('spawn', 't2', false, true);
    // when
    status.emit('status', failedStatus, 'working');
    status.emit('status', { ...failedStatus, tabId: 't2' }, 'working');
    await settle();
    // then
    expect(types(log).filter((type) => type === 'session.resumeFailed')).toHaveLength(2);
  });

  test('logs a failed transcript lookup and keeps recording', async () => {
    // given
    const { sessions, recorder, log, transcriptOffset, logger } = setup();
    transcriptOffset.mockRejectedValueOnce(new Error('reading'));
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    sessions.emit('exit', 't1', 1);
    // then
    await vi.waitFor(() => {
      expect(types(log)).toEqual(['session.spawn', 'session.exit']);
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'events',
      'failed',
      expect.objectContaining({ operation: 'recording event', type: 'session.stop', error: 'reading' }),
    );
  });

  test.each([
    { type: 'session.exit', act: ({ sessions }: Harness) => sessions.emit('exit', 't1', 1), data: { exitCode: 1 } },
    { type: 'session.interrupt', act: ({ sessions }: Harness) => sessions.emit('interrupt', 't1'), data: {} },
    {
      type: 'session.resumeFailed',
      act: ({ status }: Harness) => status.emit('status', failedStatus, 'working'),
      data: { exitCode: 1 },
    },
  ])('records $type under the last session a hook reported', async ({ type, act, data }) => {
    // given
    const harness = setup();
    harness.sessions.emit('spawn', 't1', false, false);
    harness.recorder.hook({ tabId: 't1', event: 'SessionStart', notificationType: null, sessionId: 's2' });
    // when
    act(harness);
    // then
    await vi.waitFor(() => {
      expect(harness.log.append).toHaveBeenCalledWith(type, { ...refs, session: 's2' }, data);
    });
  });

  test('forgets the hook session on the next spawn', async () => {
    // given
    const { sessions, recorder, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    recorder.hook({ tabId: 't1', event: 'SessionStart', notificationType: null, sessionId: 's2' });
    sessions.emit('spawn', 't1', false, true);
    // when
    sessions.emit('exit', 't1', 0);
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.exit', refs, { exitCode: 0 });
    });
  });

  test('forgets a closed tab after its exit', async () => {
    // given
    const { sessions, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    sessions.get.mockReturnValue(null);
    sessions.emit('exit', 't1', 0);
    // when
    sessions.emit('interrupt', 't1');
    await settle();
    // then
    expect(types(log)).toEqual(['session.spawn', 'session.exit']);
  });

  test('keeps an open tab after its exit', async () => {
    // given
    const { sessions, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    sessions.emit('exit', 't1', 0);
    // when
    sessions.emit('interrupt', 't1');
    await settle();
    // then
    expect(types(log)).toEqual(['session.spawn', 'session.exit', 'session.interrupt']);
  });

  test('records a null head when git hangs', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, recorder, log, headSha, logger } = setup();
    headSha.mockReturnValue(new Promise(() => undefined));
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    await vi.advanceTimersByTimeAsync(15_000);
    // then
    expect(log.append).toHaveBeenCalledWith('session.stop', refs, {
      transcript: null,
      head: null,
      backgroundTasks: [],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'events',
      'failed',
      expect.objectContaining({ type: 'session.stop', error: 'timing out after 15s' }),
    );
  });

  test('keeps recording after a transcript lookup hangs', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, recorder, log, transcriptOffset, logger } = setup();
    transcriptOffset.mockReturnValue(new Promise(() => undefined));
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    sessions.emit('exit', 't1', 1);
    await vi.advanceTimersByTimeAsync(15_000);
    // then
    expect(types(log)).toEqual(['session.spawn', 'session.exit']);
    expect(logger.warn).toHaveBeenCalledWith(
      'events',
      'failed',
      expect.objectContaining({ type: 'session.stop', error: 'timing out after 15s' }),
    );
  });

  test('drain waits for running sessions to exit and be recorded', async () => {
    // given
    const { sessions, recorder, log } = setup();
    sessions.emit('spawn', 't1', false, false);
    let drained = false;
    const draining = recorder.drain().then(() => {
      drained = true;
    });
    await settle();
    const before = drained;
    // when
    sessions.emit('exit', 't1', 0);
    await draining;
    // then
    expect(before).toBe(false);
    expect(types(log)).toEqual(['session.spawn', 'session.exit']);
  });

  test('drain finishes when nothing is running', async () => {
    // given
    const { recorder, logger } = setup();
    // when
    await recorder.drain();
    // then
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('drain logs and gives up after two seconds', async () => {
    // given
    vi.useFakeTimers();
    const { sessions, recorder, logger } = setup();
    sessions.emit('spawn', 't1', false, false);
    // when
    const draining = recorder.drain();
    await vi.advanceTimersByTimeAsync(2_000);
    await draining;
    // then
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', {
      operation: 'draining events',
      error: 'timing out after 2s',
    });
  });

  test('skips events for a tab it never saw', async () => {
    // given
    const { sessions, status, recorder, log } = setup();
    // when
    sessions.emit('exit', 't1', 0);
    sessions.emit('interrupt', 't1');
    status.emit('status', failedStatus, 'working');
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    await settle();
    // then
    expect(log.append).not.toHaveBeenCalled();
  });

  test('appends in event order when a lookup is slow', async () => {
    // given
    const { sessions, recorder, log, transcriptOffset } = setup();
    let finish: (offset: number) => void = () => undefined;
    transcriptOffset.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    sessions.emit('spawn', 't1', false, false);
    // when
    recorder.hook({ tabId: 't1', event: 'Stop', notificationType: null });
    sessions.emit('exit', 't1', 0);
    await settle();
    const before = types(log);
    finish(10);
    // then
    expect(before).toEqual(['session.spawn']);
    await vi.waitFor(() => {
      expect(types(log)).toEqual(['session.spawn', 'session.stop', 'session.exit']);
    });
  });

  test('logs a failed append and keeps recording', async () => {
    // given
    const { sessions, log, logger } = setup();
    log.append.mockRejectedValueOnce(new Error('writing'));
    sessions.emit('spawn', 't1', false, false);
    // when
    sessions.emit('exit', 't1', 1);
    // then
    await vi.waitFor(() => {
      expect(log.append).toHaveBeenCalledWith('session.exit', refs, { exitCode: 1 });
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'events',
      'failed',
      expect.objectContaining({ operation: 'recording event', type: 'session.spawn', error: 'writing' }),
    );
  });
});
