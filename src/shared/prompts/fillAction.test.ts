import { describe, expect, test } from 'vitest';
import { fillAction } from './fillAction';

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
