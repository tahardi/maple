import { describe, expect, test } from 'vitest';
import { applyDecisionsPrompt } from './applyDecisionsPrompt';

describe('applyDecisionsPrompt', () => {
  test('names the steps, the skill, and the card', () => {
    // given
    const key = 'MPL-7';
    // when
    const prompt = applyDecisionsPrompt(key);
    // then
    expect(prompt).toBe('Run the "Apply Finding Decisions" steps from the /card skill for MPL-7.');
  });
});
