import { describe, expect, test } from 'vitest';
import { cardPrompt, fillAction, SUGGEST_PROMPT } from './prompts';

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

describe('SUGGEST_PROMPT', () => {
  test('names the sprint and ends with the batch format', () => {
    // given
    const jiraKey = 'DIG';
    // when
    const prompt = SUGGEST_PROMPT(jiraKey, 9);
    // then
    expect(prompt).toContain('active DIG sprint');
    expect(prompt.endsWith('(or MAPLE-BATCH: none).')).toBe(true);
  });

  test('falls back to the backlog when nothing in the sprint can start', () => {
    // given
    const jiraKey = 'DIG';
    // when
    const prompt = SUGGEST_PROMPT(jiraKey, 9);
    // then
    expect(prompt).toContain('If no To Do card in the active DIG sprint can start');
    expect(prompt).toContain('DIG backlog');
    expect(prompt.endsWith('MAPLE-BATCH: KEY-1, KEY-2 (or MAPLE-BATCH: none).')).toBe(true);
  });

  test.each([
    { roomPoints: 9, expected: 'The DIG backlog cards you suggest must total at most 9 points' },
    { roomPoints: 0, expected: 'Do not suggest any DIG backlog cards' },
  ])('limits backlog cards to $roomPoints points of room', ({ roomPoints, expected }) => {
    // given
    const jiraKey = 'DIG';
    // when
    const prompt = SUGGEST_PROMPT(jiraKey, roomPoints);
    // then
    expect(prompt).toContain(expected);
    expect(prompt.endsWith('MAPLE-BATCH: KEY-1, KEY-2 (or MAPLE-BATCH: none).')).toBe(true);
  });
});
