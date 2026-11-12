import { describe, expect, test } from 'vitest';
import { eventChannel } from './eventChannel';

describe('eventChannel', () => {
  test.each([
    { area: 'tabs', method: 'onStatus', keys: [], want: 'tabs:status' },
    { area: 'tabs', method: 'onActivate', keys: [], want: 'tabs:activate' },
    { area: 'repo', method: 'onChanged', keys: ['t1'], want: 'repo:changed:t1' },
    { area: 'session', method: 'onBatch', keys: ['MPL'], want: 'session:batch:MPL' },
    { area: 'terminal', method: 'onExit', keys: ['t1:2'], want: 'terminal:exit:t1:2' },
  ])('$area $method with $keys is $want', ({ area, method, keys, want }) => {
    // given
    const args = { area, method, keys };

    // when
    const channel = eventChannel(args.area, args.method, args.keys);

    // then
    expect(channel).toBe(want);
  });
});
