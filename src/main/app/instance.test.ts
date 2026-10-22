import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { claimInstance } from './instance';

function fakeApp(locked: boolean) {
  return { setPath: vi.fn(), requestSingleInstanceLock: vi.fn(() => locked) };
}

describe('claimInstance', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('gives a custom config dir its own Chromium profile', () => {
    // given
    vi.stubEnv('MAPLE_CONFIG_DIR', '/tmp/maple-try');
    const app = fakeApp(true);
    // when
    claimInstance(app);
    // then
    expect(app.setPath).toHaveBeenCalledWith('userData', join('/tmp/maple-try', 'electron'));
  });

  test('keeps the default profile without a custom config dir', () => {
    // given
    vi.stubEnv('MAPLE_CONFIG_DIR', undefined);
    const app = fakeApp(true);
    // when
    claimInstance(app);
    // then
    expect(app.setPath).not.toHaveBeenCalled();
  });

  test.each([true, false])('returns %s from the single-instance lock', (locked) => {
    // given
    vi.stubEnv('MAPLE_CONFIG_DIR', '/tmp/maple-try');
    const app = fakeApp(locked);
    // when
    const claimed = claimInstance(app);
    // then
    expect(claimed).toBe(locked);
  });
});
