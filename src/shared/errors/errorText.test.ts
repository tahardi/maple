import { describe, expect, test } from 'vitest';
import { errorText } from './errorText';

describe('errorText', () => {
  test.each<{ name: string; err: unknown; want: string }>([
    { name: 'plain Error', err: new Error('reading config: x'), want: 'reading config: x' },
    {
      name: 'IPC prefix',
      err: new Error("Error invoking remote method 'tabs:startCard': Error: creating worktree: exists"),
      want: 'creating worktree: exists',
    },
    {
      name: 'IPC prefix without Error:',
      err: new Error("Error invoking remote method 'tabs:startCard': x"),
      want: 'x',
    },
    {
      name: 'IPC prefix with another error type',
      err: new Error("Error invoking remote method 'pr:approve': TypeError: x"),
      want: 'TypeError: x',
    },
    { name: 'thrown string', err: 'offline', want: 'offline' },
    { name: 'thrown number', err: 42, want: '42' },
  ])('$name gives "$want"', ({ err, want }) => {
    // given
    const thrown = err;

    // when
    const got = errorText(thrown);

    // then
    expect(got).toBe(want);
  });
});
