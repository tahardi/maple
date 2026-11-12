import { describe, expect, test } from 'vitest';
import { refinePrompt } from './refinePrompt';

describe('refinePrompt', () => {
  test('builds the refine command', () => {
    // given
    const projectKey = 'DIG';
    // when
    const prompt = refinePrompt(projectKey);
    // then
    expect(prompt).toBe('/refine DIG');
  });
});
