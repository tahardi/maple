import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createLogger } from './log';
import { showStartupFailure } from './startupFailure';

describe('showStartupFailure', () => {
  const setup = () => {
    const showErrorBox = vi.fn();
    const quit = vi.fn();
    const write = vi.fn();
    return { showErrorBox, quit, write, deps: { showErrorBox, quit, logger: createLogger(write) } };
  };

  beforeEach(() => {
    vi.stubEnv('MAPLE_CONFIG_DIR', '/tmp/maple-try');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'an Error message', err: new Error('writing hooks file: EACCES'), text: 'writing hooks file: EACCES' },
    { name: 'a thrown string', err: 'boom', text: 'boom' },
  ])('shows $name in the dialog with the log path', ({ err, text }) => {
    // given
    const { showErrorBox, deps } = setup();

    // when
    showStartupFailure(err, deps);

    // then
    expect(showErrorBox).toHaveBeenCalledTimes(1);
    expect(showErrorBox).toHaveBeenCalledWith('Maple could not start', `${text}\n\nLog: /tmp/maple-try/logs/main.log`);
  });

  test('logs the failure with its stack', () => {
    // given
    const { write, deps } = setup();

    // when
    showStartupFailure(new Error('writing hooks file: EACCES'), deps);

    // then
    expect(write).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/^app startup failed error="writing hooks file: EACCES" stack=/),
    );
  });

  test('logs a thrown string by its text', () => {
    // given
    const { write, deps } = setup();

    // when
    showStartupFailure('boom', deps);

    // then
    expect(write).toHaveBeenCalledWith('error', expect.stringMatching(/^app startup failed error=boom/));
  });

  test('logs before the dialog blocks', () => {
    // given
    const { showErrorBox, write, deps } = setup();

    // when
    showStartupFailure(new Error('writing hooks file: EACCES'), deps);

    // then
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(showErrorBox.mock.invocationCallOrder[0] ?? 0);
  });

  test('quits after the dialog closes', () => {
    // given
    const { showErrorBox, quit, deps } = setup();

    // when
    showStartupFailure(new Error('writing hooks file: EACCES'), deps);

    // then
    expect(quit).toHaveBeenCalledTimes(1);
    expect(showErrorBox.mock.invocationCallOrder[0]).toBeLessThan(quit.mock.invocationCallOrder[0] ?? 0);
  });
});
