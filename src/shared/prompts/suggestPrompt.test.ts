import { describe, expect, test } from 'vitest';
import { suggestPrompt } from './suggestPrompt';

describe('suggestPrompt', () => {
  test('names the sprint and ends with the batch format', () => {
    // given
    const jiraKey = 'DIG';
    // when
    const prompt = suggestPrompt(jiraKey);
    // then
    expect(prompt).toContain('active DIG sprint');
    expect(prompt.endsWith('(or MAPLE-BATCH: none).')).toBe(true);
  });

  test('falls back to the backlog when nothing in the sprint can start', () => {
    // given
    const jiraKey = 'DIG';
    // when
    const prompt = suggestPrompt(jiraKey);
    // then
    expect(prompt).toContain('If no To Do card in the active DIG sprint can start');
    expect(prompt).toContain('DIG backlog');
    expect(prompt.endsWith('MAPLE-BATCH: KEY-1, KEY-2 (or MAPLE-BATCH: none).')).toBe(true);
  });
});
