import { describe, expect, test } from 'vitest';
import { windowTitle } from './windowTitle';

describe('windowTitle', () => {
  test.each([
    { name: 'Maple without a config dir', dir: undefined, want: 'Maple' },
    {
      name: 'the worktree folder for a try instance',
      dir: '/home/x/wts/maple-mpl-78-try/.maple-try',
      want: 'Maple (try: maple-mpl-78-try)',
    },
    {
      name: 'the config dir for any other config dir',
      dir: '/tmp/maple-e2e-abc/config',
      want: 'Maple (config: /tmp/maple-e2e-abc/config)',
    },
  ])('returns $name', ({ dir, want }) => {
    // given
    const env = { MAPLE_CONFIG_DIR: dir };
    // when
    const title = windowTitle(env);
    // then
    expect(title).toBe(want);
  });
});
