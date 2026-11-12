import { beforeEach, describe, expect, test, vi } from 'vitest';
import { findWorktrees } from '@main/git/findWorktrees';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import { WorktreeTracker } from './WorktreeTracker';

vi.mock('@main/git/findWorktrees', () => ({ findWorktrees: vi.fn() }));
vi.mock('@main/git/worktreeWatcher', () => ({ watchWorktrees: vi.fn() }));

function setup(initial: string[] | null = []) {
  let current: string[] | null = initial;
  const found = vi.fn<(tabId: string, paths: string[]) => void>((_tabId, paths) => {
    current = paths;
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const tracker = new WorktreeTracker({ worktreesDir: () => '/tmp/wts', current: () => current, found, logger });
  const gone = () => {
    current = null;
  };
  return { tracker, found, logger, gone };
}

function captureWatch(): () => void {
  let onChange: () => void = () => undefined;
  vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
    onChange = cb;
    return () => undefined;
  });
  return () => {
    onChange();
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('WorktreeTracker', () => {
  beforeEach(() => {
    vi.mocked(findWorktrees).mockReset().mockResolvedValue([]);
    vi.mocked(watchWorktrees)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  test('track reports found worktrees', async () => {
    // given
    vi.mocked(findWorktrees).mockResolvedValue(['/tmp/wts/dig-44']);
    const { tracker, found } = setup();
    // when
    tracker.track('t1', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(found).toHaveBeenCalledWith('t1', ['/tmp/wts/dig-44']);
    });
    expect(findWorktrees).toHaveBeenCalledWith('/tmp/wts', 'DIG-44');
  });

  test('an unchanged list reports nothing', async () => {
    // given
    vi.mocked(findWorktrees).mockResolvedValue(['/tmp/wts/dig-44']);
    const { tracker, found } = setup(['/tmp/wts/dig-44']);
    // when
    tracker.track('t1', 'DIG-44');
    await settle();
    // then
    expect(findWorktrees).toHaveBeenCalledTimes(1);
    expect(found).not.toHaveBeenCalled();
  });

  test('a watch event checks again and reports a changed list', async () => {
    // given
    const change = captureWatch();
    vi.mocked(findWorktrees).mockResolvedValueOnce([]).mockResolvedValueOnce(['/tmp/wts/dig-44']);
    const { tracker, found } = setup();
    tracker.track('t1', 'DIG-44');
    await settle();
    // when
    change();
    // then
    await vi.waitFor(() => {
      expect(found).toHaveBeenCalledWith('t1', ['/tmp/wts/dig-44']);
    });
    expect(found).toHaveBeenCalledTimes(1);
  });

  test('a failed lookup reports nothing and logs at warn', async () => {
    // given
    vi.mocked(findWorktrees).mockRejectedValue(new Error('listing worktrees: denied'));
    const { tracker, found, logger } = setup();
    // when
    tracker.track('t1', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', {
        operation: 'findWorktrees',
        cardKey: 'DIG-44',
        error: 'listing worktrees: denied',
      });
    });
    expect(found).not.toHaveBeenCalled();
  });

  test('a failed watch logs at warn and still checks once', async () => {
    // given
    vi.mocked(watchWorktrees).mockImplementation(() => {
      throw new Error('watching: too many files');
    });
    vi.mocked(findWorktrees).mockResolvedValue(['/tmp/wts/dig-44']);
    const { tracker, found, logger } = setup();
    // when
    tracker.track('t1', 'DIG-44');
    // then
    expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', {
      operation: 'watchWorktrees',
      cardKey: 'DIG-44',
      error: 'watching: too many files',
    });
    await vi.waitFor(() => {
      expect(found).toHaveBeenCalledTimes(1);
    });
  });

  test('a lookup that finishes after stop reports nothing', async () => {
    // given
    let resolve: (paths: string[]) => void = () => undefined;
    vi.mocked(findWorktrees).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const stop = vi.fn();
    vi.mocked(watchWorktrees).mockReturnValue(stop);
    const { tracker, found } = setup();
    tracker.track('t1', 'DIG-44');
    // when
    tracker.stop('t1');
    resolve(['/tmp/wts/dig-44']);
    await settle();
    // then
    expect(stop).toHaveBeenCalledTimes(1);
    expect(found).not.toHaveBeenCalled();
  });

  test('a lookup for a tab that is gone reports nothing', async () => {
    // given
    let resolve: (paths: string[]) => void = () => undefined;
    vi.mocked(findWorktrees).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { tracker, found, gone } = setup();
    tracker.track('t1', 'DIG-44');
    // when
    gone();
    resolve(['/tmp/wts/dig-44']);
    await settle();
    // then
    expect(found).not.toHaveBeenCalled();
  });

  test('stopAll stops every watch', () => {
    // given
    const stops = [vi.fn(), vi.fn()];
    vi.mocked(watchWorktrees).mockReturnValueOnce(stops[0]).mockReturnValueOnce(stops[1]);
    const { tracker } = setup();
    tracker.track('t1', 'DIG-44');
    tracker.track('t2', 'DIG-45');
    // when
    tracker.stopAll();
    // then
    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      event: 'found',
      before: [],
      after: ['/tmp/wts/dig-44'],
      fields: { cardKey: 'DIG-44', paths: ['/tmp/wts/dig-44'] },
    },
    { event: 'gone', before: ['/tmp/wts/dig-44'], after: [], fields: { cardKey: 'DIG-44' } },
  ])('logs $event', async ({ event, before, after, fields }) => {
    // given
    vi.mocked(findWorktrees).mockResolvedValue(after);
    const { tracker, logger } = setup(before);
    // when
    tracker.track('t1', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('worktree', event, fields);
    });
  });
});
