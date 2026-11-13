import { describe, expect, test } from 'vitest';
import { resumePrompt } from './resumePrompt';

describe('resumePrompt', () => {
  test('names the skill steps and the card', () => {
    // given
    const key = 'MPL-343';
    // when
    const prompt = resumePrompt(key);
    // then
    expect(prompt).toBe('Run the "Apply Finding Decisions" steps from the /card skill for MPL-343.');
  });
});
