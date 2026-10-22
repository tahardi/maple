import type { LineMark } from '@shared/types/files';
import { type DecorationSpec, toDecorations } from './inFileDecorations';

describe('toDecorations', () => {
  test.each<{ name: string; mark: LineMark; want: DecorationSpec }>([
    {
      name: 'an add as a green line with no hover',
      mark: { kind: 'add', line: 3 },
      want: {
        startLine: 3,
        endLine: 3,
        className: 'line-add',
        marginClassName: 'margin-add',
        overviewColor: '#57ab5a',
        hover: null,
      },
    },
    {
      name: 'a chg with its old text in the hover',
      mark: { kind: 'chg', line: 2, oldText: 'a\nb' },
      want: {
        startLine: 2,
        endLine: 2,
        className: 'line-chg',
        marginClassName: 'margin-chg',
        overviewColor: '#d4b106',
        hover: 'Was:\n```\na\nb\n```',
      },
    },
    {
      name: 'a chg without old text with no hover',
      mark: { kind: 'chg', line: 4, oldText: null },
      want: {
        startLine: 4,
        endLine: 4,
        className: 'line-chg',
        marginClassName: 'margin-chg',
        overviewColor: '#d4b106',
        hover: null,
      },
    },
    {
      name: 'a del after line 0 on line 1 above it',
      mark: { kind: 'del', afterLine: 0, oldText: 'gone' },
      want: {
        startLine: 1,
        endLine: 1,
        className: 'del-above',
        marginClassName: 'margin-del',
        overviewColor: '#e5534b',
        hover: 'Was:\n```\ngone\n```',
      },
    },
    {
      name: 'a del after line 5 on line 5 below it',
      mark: { kind: 'del', afterLine: 5, oldText: 'gone' },
      want: {
        startLine: 5,
        endLine: 5,
        className: 'del-below',
        marginClassName: 'margin-del',
        overviewColor: '#e5534b',
        hover: 'Was:\n```\ngone\n```',
      },
    },
    {
      name: 'a chg whose old text has three backticks in a longer fence',
      mark: { kind: 'chg', line: 2, oldText: 'a\n```\n[x](https://evil.example)' },
      want: {
        startLine: 2,
        endLine: 2,
        className: 'line-chg',
        marginClassName: 'margin-chg',
        overviewColor: '#d4b106',
        hover: 'Was:\n````\na\n```\n[x](https://evil.example)\n````',
      },
    },
    {
      name: 'a del whose old text has a single backtick in a three-backtick fence',
      mark: { kind: 'del', afterLine: 5, oldText: 'x = `y`' },
      want: {
        startLine: 5,
        endLine: 5,
        className: 'del-below',
        marginClassName: 'margin-del',
        overviewColor: '#e5534b',
        hover: 'Was:\n```\nx = `y`\n```',
      },
    },
  ])('maps $name', ({ mark, want }) => {
    // given
    const marks = [mark];
    // when
    const specs = toDecorations(marks);
    // then
    expect(specs).toEqual([want]);
  });

  test.each([
    { name: 'the longest of several backtick runs', oldText: '`a` ```b``` ``c``', want: '````' },
    { name: 'a run longer than three', oldText: 'a\n`````\nb', want: '``````' },
    { name: 'old text that is only backticks', oldText: '```', want: '````' },
    { name: 'empty old text', oldText: '', want: '```' },
  ])('fences $name', ({ oldText, want }) => {
    // given
    const marks: LineMark[] = [{ kind: 'chg', line: 1, oldText }];
    // when
    const specs = toDecorations(marks);
    // then
    expect(specs[0]?.hover).toBe(`Was:\n${want}\n${oldText}\n${want}`);
  });

  test('fences old text with very many backtick runs', () => {
    // given
    const oldText = '`a'.repeat(500000);
    const marks: LineMark[] = [{ kind: 'chg', line: 1, oldText }];
    // when
    const specs = toDecorations(marks);
    // then
    expect(specs[0]?.hover).toBe(`Was:\n\`\`\`\n${oldText}\n\`\`\``);
  });

  test('keeps marks in order', () => {
    // given
    const marks: LineMark[] = [
      { kind: 'add', line: 1 },
      { kind: 'del', afterLine: 3, oldText: 'x' },
      { kind: 'chg', line: 7, oldText: 'y' },
    ];
    // when
    const specs = toDecorations(marks);
    // then
    expect(specs.map((spec) => [spec.startLine, spec.className])).toEqual([
      [1, 'line-add'],
      [3, 'del-below'],
      [7, 'line-chg'],
    ]);
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
