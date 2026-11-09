import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns the result of a lookup that finishes in time', async () => {
    // given
    const lookup = Promise.resolve('done');
    // when
    const result = await withTimeout(lookup, 1000);
    // then
    expect(result).toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('rejects with the failure of a lookup that fails in time', async () => {
    // given
    const lookup = Promise.reject(new Error('reading'));
    // when
    const result = withTimeout(lookup, 1000);
    // then
    await expect(result).rejects.toThrow('reading');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('rejects when the lookup outlasts the limit', async () => {
    // given
    const lookup = new Promise<string>(() => undefined);
    // when
    const result = withTimeout(lookup, 2000);
    const checked = expect(result).rejects.toThrow('timing out after 2s');
    await vi.advanceTimersByTimeAsync(2000);
    // then
    await checked;
  });
});
