import { describe, expect, test } from 'vitest';
import { zoomLevel } from './zoom';

describe('zoomLevel', () => {
  test.each([
    { change: 'in', current: 1, want: 1.5 },
    { change: 'out', current: 1, want: 0.5 },
    { change: 'reset', current: 2, want: 0 },
  ] as const)('zooms $change from $current to $want', ({ change, current, want }) => {
    // given
    const level = current;
    // when
    const next = zoomLevel(level, change);
    // then
    expect(next).toBe(want);
  });
});
