import { describe, expect, test } from 'vitest';
import { closePrompt } from './closePrompt';

describe('closePrompt', () => {
  test('builds the close command', () => {
    // given
    const key = 'DIG-44';
    // when
    const prompt = closePrompt(key);
    // then
    expect(prompt).toBe('/card DIG-44 close');
  });
});
