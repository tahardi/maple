import { describe, expect, test } from 'vitest';
import { parseBatch } from './batch';

describe('parseBatch', () => {
  test.each([
    { input: 'reasoning\nMAPLE-BATCH: DIG-44, DIG-45, DIG-47', expected: ['DIG-44', 'DIG-45', 'DIG-47'] },
    { input: 'MAPLE-BATCH: none', expected: [] },
    { input: 'MAPLE-BATCH:DIG-1,DIG-2  ', expected: ['DIG-1', 'DIG-2'] },
    { input: 'first MAPLE-BATCH: DIG-1\nMAPLE-BATCH: DIG-2', expected: ['DIG-2'] },
    { input: 'no marker here', expected: null },
    { input: 'MAPLE-BATCH: dig-1, Bogus', expected: null },
  ])('parses $input', ({ input, expected }) => {
    // given
    const text = input;
    // when
    const keys = parseBatch(text);
    // then
    expect(keys).toEqual(expected);
  });
});
