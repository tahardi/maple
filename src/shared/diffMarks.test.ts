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
    {
      name: 'treats an empty base like a new file',
      base: '',
      current: 'a\n',
      expected: [{ kind: 'add', line: 1 }],
    },
    {
      name: 'marks every line of an emptied file as deleted at the top',
      base: 'a\nb\nc\n',
      current: '',
      expected: [{ kind: 'del', afterLine: 0, oldText: 'a\nb\nc' }],
    },
    {
      name: 'marks lines appended at the end as added',
      base: 'a\nb\n',
      current: 'a\nb\nc\nd\n',
      expected: [
        { kind: 'add', line: 3 },
        { kind: 'add', line: 4 },
      ],
    },
    {
      name: 'marks lines removed at the end after the last line',
      base: 'a\nb\nc\n',
      current: 'a\n',
      expected: [{ kind: 'del', afterLine: 1, oldText: 'b\nc' }],
    },
    {
      name: 'marks three lines replaced by one as a single change',
      base: '1\n2\n3\n',
      current: '9\n',
      expected: [{ kind: 'chg', line: 1, oldText: '1\n2\n3' }],
    },
    {
      name: 'keeps line numbers right across separate hunks',
      base: 'a\nb\nc\nd\ne\n',
      current: 'X\nb\nc\nd\nY\n',
      expected: [
        { kind: 'chg', line: 1, oldText: 'a' },
        { kind: 'chg', line: 5, oldText: 'e' },
      ],
    },
    {
      name: 'shifts later marks after an insertion',
      base: 'a\nb\nc\n',
      current: 'a\nNEW\nb\nC\n',
      expected: [
        { kind: 'add', line: 2 },
        { kind: 'chg', line: 4, oldText: 'c' },
      ],
    },
    {
      name: 'marks a last line that gains a trailing newline as changed',
      base: 'a\nb',
      current: 'a\nb\n',
      expected: [{ kind: 'chg', line: 2, oldText: 'b' }],
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
