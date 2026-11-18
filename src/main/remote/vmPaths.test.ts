import { describe, expect, test } from 'vitest';
import { vmFindingsDir, vmTmuxConf } from './vmPaths';

describe('vmPaths', () => {
  test.each([
    { name: 'the tmux conf', got: vmTmuxConf('/home/dev'), want: '/home/dev/.xena/maple-tmux.conf' },
    { name: 'the findings dir', got: vmFindingsDir('/home/dev'), want: '/home/dev/.local/state/maple/findings' },
  ])('$name', ({ got, want }) => {
    // then
    expect(got).toBe(want);
  });
});
