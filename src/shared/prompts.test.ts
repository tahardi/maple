import { describe, expect, test } from 'vitest';
import { cardPrompt, fillAction, secondReadPrompt, SUGGEST_PROMPT } from './prompts';

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
    const prompt = SUGGEST_PROMPT(jiraKey);
    // then
    expect(prompt).toContain('active DIG sprint');
    expect(prompt.endsWith('(or MAPLE-BATCH: none).')).toBe(true);
  });
});

describe('secondReadPrompt', () => {
  test('secondReadPrompt names the PR and the findings line', () => {
    // given
    const num = 33;
    // when
    const prompt = secondReadPrompt(num);
    // then
    expect(prompt).toContain('gh pr diff 33');
    expect(prompt).toContain('Do not edit files, commit, push, or comment');
    expect(prompt).toContain('relative to the repo root');
    expect(prompt).toContain('line numbers in the current file');
    expect(
      prompt.endsWith(
        'End your answer with exactly one line in this format and nothing after it: ' +
          'MAPLE-FINDINGS: <JSON array of {"path","line","text"}> (or MAPLE-FINDINGS: []).',
      ),
    ).toBe(true);
  });
});
