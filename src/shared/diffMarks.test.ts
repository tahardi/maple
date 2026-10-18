import { describe, expect, test } from 'vitest';
import type { LineMark } from './types';
import { lineMarks } from './diffMarks';

describe('lineMarks', () => {
  test.each<{ name: string; base: string | null; current: string; expected: LineMark[] }>([
    {
      name: 'marks every line of a new file as added',
      base: null,
      current: 'a\nb\nc\n',
      expected: [
        { kind: 'add', line: 1 },
        { kind: 'add', line: 2 },
        { kind: 'add', line: 3 },
      ],
    },
    {
      name: 'marks a changed middle line',
      base: 'a\nb\nc\n',
      current: 'a\nX\nc\n',
      expected: [{ kind: 'chg', line: 2, oldText: 'b' }],
    },
    {
      name: 'marks two lines replaced by three',
      base: 'a\nb\nc\nd\n',
      current: 'a\nX\nY\nZ\nd\n',
      expected: [
        { kind: 'chg', line: 2, oldText: 'b\nc' },
        { kind: 'chg', line: 3, oldText: null },
        { kind: 'add', line: 4 },
      ],
    },
    {
      name: 'marks two lines removed after line 4',
      base: '1\n2\n3\n4\n5\n6\n7\n',
      current: '1\n2\n3\n4\n7\n',
      expected: [{ kind: 'del', afterLine: 4, oldText: '5\n6' }],
    },
    {
      name: 'marks lines removed at the top',
      base: '1\n2\n3\n',
      current: '3\n',
      expected: [{ kind: 'del', afterLine: 0, oldText: '1\n2' }],
    },
    {
      name: 'returns nothing for identical text',
      base: 'a\nb\n',
      current: 'a\nb\n',
      expected: [],
    },
  ])('$name', ({ base, current, expected }) => {
    // given
    const before = base;
    // when
    const marks = lineMarks(before, current);
    // then
    expect(marks).toEqual(expected);
  });
});
