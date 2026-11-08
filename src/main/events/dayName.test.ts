import { afterEach, describe, expect, test, vi } from 'vitest';
import { dayName } from './dayName';

describe('dayName', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { tz: 'UTC', at: '2026-11-07T23:59:59.999Z', want: '2026-11-07' },
    { tz: 'America/Los_Angeles', at: '2026-11-08T03:00:00.000Z', want: '2026-11-07' },
    { tz: 'Asia/Tokyo', at: '2026-11-07T16:00:00.000Z', want: '2026-11-08' },
    { tz: 'UTC', at: '2026-01-05T00:00:00.000Z', want: '2026-01-05' },
  ])('names $at as $want in $tz', ({ tz, at, want }) => {
    // given
    vi.stubEnv('TZ', tz);

    // when
    const name = dayName(new Date(at));

    // then
    expect(name).toBe(want);
  });
});
