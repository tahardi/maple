import type { LineMark } from '@shared/types';
import { toDecorations } from './inFileDecorations';

describe('toDecorations', () => {
  test.each<{ name: string; mark: LineMark; want: Partial<ReturnType<typeof toDecorations>[number]> }>([
    {
      name: 'an add as a green line with no hover',
      mark: { kind: 'add', line: 3 },
      want: { startLine: 3, endLine: 3, className: 'line-add', overviewColor: '#57ab5a', hover: null },
    },
    {
      name: 'a chg with its old text in the hover',
      mark: { kind: 'chg', line: 2, oldText: 'a\nb' },
      want: {
        startLine: 2,
        endLine: 2,
        className: 'line-chg',
        overviewColor: '#d4b106',
        hover: 'Was:\n```\na\nb\n```',
      },
    },
    {
      name: 'a chg without old text with no hover',
      mark: { kind: 'chg', line: 4, oldText: null },
      want: { startLine: 4, className: 'line-chg', hover: null },
    },
    {
      name: 'a del after line 0 on line 1 above it',
      mark: { kind: 'del', afterLine: 0, oldText: 'gone' },
      want: {
        startLine: 1,
        endLine: 1,
        className: 'del-above',
        overviewColor: '#e5534b',
        hover: 'Was:\n```\ngone\n```',
      },
    },
    {
      name: 'a del after line 5 on line 5 below it',
      mark: { kind: 'del', afterLine: 5, oldText: 'gone' },
      want: { startLine: 5, endLine: 5, className: 'del-below' },
    },
  ])('maps $name', ({ mark, want }) => {
    // given
    const marks = [mark];
    // when
    const specs = toDecorations(marks);
    // then
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject(want);
  });

  test('maps no marks to no specs', () => {
    // given
    const marks: LineMark[] = [];
    // when
    const specs = toDecorations(marks);
    // then
    expect(specs).toEqual([]);
  });
});
