import { describe, expect, test } from 'vitest';
import { cardPrompt } from './cardPrompt';

describe('cardPrompt', () => {
  test('builds the card command', () => {
    // given
    const key = 'DIG-44';
    // when
    const prompt = cardPrompt(key);
    // then
    expect(prompt).toBe('/card DIG-44');
  });
});
