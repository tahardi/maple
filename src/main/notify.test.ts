import { describe, expect, test, vi } from 'vitest';
import type { Dot } from '@shared/types';
import { shouldNotify } from './notify';

vi.mock('electron', () => ({ Notification: vi.fn() }));

describe('shouldNotify', () => {
  test.each<{ name: string; prev: Dot; focused: boolean; active: string | null; enabled: boolean; want: boolean }>([
    {
      name: 'turning waiting while unfocused',
      prev: 'working',
      focused: false,
      active: 't1',
      enabled: true,
      want: true,
    },
    { name: 'turning waiting on another tab', prev: 'working', focused: true, active: 't2', enabled: true, want: true },
    { name: 'turning waiting on this tab', prev: 'working', focused: true, active: 't1', enabled: true, want: false },
    { name: 'already waiting', prev: 'waiting', focused: false, active: null, enabled: true, want: false },
    { name: 'disabled', prev: 'working', focused: false, active: null, enabled: false, want: false },
  ])('$name', ({ prev, focused, active, enabled, want }) => {
    // given
    const dot: Dot = 'waiting';
    // when
    const got = shouldNotify(dot, prev, focused, active, 't1', enabled);
    // then
    expect(got).toBe(want);
  });
});
