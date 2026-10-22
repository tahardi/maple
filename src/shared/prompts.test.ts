import { describe, expect, test } from 'vitest';
import { cardPrompt, fillAction, refinePrompt, suggestPrompt } from './prompts';

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

describe('fillAction', () => {
  test.each([
    { pr: 33, expected: '/card DIG-44 33' },
    { pr: null, expected: '/card DIG-44 ' },
  ])('fills key and pr $pr', ({ pr, expected }) => {
    // given
    const template = '/card {key} {pr}';
    // when
    const prompt = fillAction(template, { key: 'DIG-44', pr });
    // then
    expect(prompt).toBe(expected);
  });
});

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
