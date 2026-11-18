import { describe, expect, test } from 'vitest';
import { fallbackRunner } from './fallbackRunner';
import { LocalRunner } from './localRunner';

const NO_VM = 'reaching the VM: Maple started without a remote block; add one and restart Maple';

describe('fallbackRunner', () => {
  test('runs locally when MAPLE_LOCAL_RUNNER is 1', () => {
    // when
    const runner = fallbackRunner({ MAPLE_LOCAL_RUNNER: '1' });

    // then
    expect(runner).toBeInstanceOf(LocalRunner);
  });

  test.each([
    { name: 'unset', env: {} },
    { name: '0', env: { MAPLE_LOCAL_RUNNER: '0' } },
  ])('refuses every call when MAPLE_LOCAL_RUNNER is $name', async ({ env }) => {
    // given
    const runner = fallbackRunner(env);

    // when
    const spawn = () => runner.spawnPty(['bash', '-l'], { cwd: '/home/dev', env: {}, cols: 120, rows: 40 });
    const follow = () => runner.follow('/home/dev/x', () => undefined);

    // then
    expect(spawn).toThrow(NO_VM);
    expect(follow).toThrow(NO_VM);
    await expect(runner.exec(['true'])).rejects.toThrow(NO_VM);
    await expect(runner.readFile('/home/dev/x')).rejects.toThrow(NO_VM);
  });
});
