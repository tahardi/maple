import { describe, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { reloadOnCrash } from './reloadOnCrash';

function fakeContents(destroyed = false) {
  return Object.assign(new EventEmitter(), {
    reload: vi.fn(),
    isDestroyed: vi.fn(() => destroyed),
  });
}

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('reloadOnCrash', () => {
  test.each([
    { reason: 'crashed', exitCode: 1 },
    { reason: 'oom', exitCode: 2 },
    { reason: 'killed', exitCode: 9 },
    { reason: 'abnormal-exit', exitCode: 3 },
  ])('reloads and logs when the renderer is gone with $reason', ({ reason, exitCode }) => {
    // given
    const contents = fakeContents();
    const logger = fakeLogger();
    reloadOnCrash(contents, logger, () => 50_000);
    // when
    contents.emit('render-process-gone', {}, { reason, exitCode });
    // then
    expect(contents.reload).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith('app', 'renderer gone', { reason, exitCode });
  });

  test('does not reload after a clean exit', () => {
    // given
    const contents = fakeContents();
    const logger = fakeLogger();
    reloadOnCrash(contents, logger, () => 50_000);
    // when
    contents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
    // then
    expect(contents.reload).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('app', 'renderer gone', { reason: 'clean-exit', exitCode: 0 });
  });

  test('does not reload destroyed contents', () => {
    // given
    const contents = fakeContents(true);
    const logger = fakeLogger();
    reloadOnCrash(contents, logger, () => 50_000);
    // when
    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    // then
    expect(contents.reload).not.toHaveBeenCalled();
  });

  test('does not reload a second crash within 10 seconds', () => {
    // given
    const contents = fakeContents();
    const logger = fakeLogger();
    let time = 50_000;
    reloadOnCrash(contents, logger, () => time);
    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    // when
    time += 9_999;
    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    // then
    expect(contents.reload).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith('app', 'renderer crashed again, not reloading', {
      reason: 'crashed',
      exitCode: 1,
    });
  });

  test('reloads a second crash after 10 seconds', () => {
    // given
    const contents = fakeContents();
    const logger = fakeLogger();
    let time = 50_000;
    reloadOnCrash(contents, logger, () => time);
    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    // when
    time += 10_000;
    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    // then
    expect(contents.reload).toHaveBeenCalledTimes(2);
  });
});
