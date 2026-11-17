import { describe, expect, test } from 'vitest';
import { lessonPrompt } from './lessonPrompt';

describe('lessonPrompt', () => {
  test('names the skill and the note', () => {
    // given
    const note = 'Learning/Security/command-injection.md';
    // when
    const prompt = lessonPrompt(note);
    // then
    expect(prompt).toBe('/learn Learning/Security/command-injection.md');
  });
});
