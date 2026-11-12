import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { logUncaught } from './logUncaught';

describe('logUncaught', () => {
  test.each([
    { event: 'uncaughtException', reason: new Error('boom'), msg: 'uncaught exception', error: 'boom' },
    { event: 'unhandledRejection', reason: new Error('boom'), msg: 'unhandled rejection', error: 'boom' },
    { event: 'unhandledRejection', reason: 'nope', msg: 'unhandled rejection', error: 'nope' },
  ])('logs $event of $error at error', ({ event, reason, msg, error }) => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const proc = new EventEmitter();
    logUncaught(logger, proc);
    // when
    proc.emit(event, reason);
    // then
    expect(logger.error).toHaveBeenCalledWith('app', msg, expect.objectContaining({ error }));
  });
});
