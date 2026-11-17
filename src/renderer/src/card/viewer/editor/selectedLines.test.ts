import { linesLabel, selectedLines } from './selectedLines';

describe('selectedLines', () => {
  test.each([
    { name: 'a cursor', selection: [3, 5, 3, 5], want: { start: 3, end: 3 } },
    { name: 'a selection inside one line', selection: [3, 1, 3, 9], want: { start: 3, end: 3 } },
    { name: 'a selection across lines', selection: [2, 4, 5, 2], want: { start: 2, end: 5 } },
    { name: 'a selection ending at the start of a line', selection: [2, 1, 5, 1], want: { start: 2, end: 4 } },
  ])('takes the lines of $name', ({ selection, want }) => {
    // given
    const [startLineNumber, startColumn, endLineNumber, endColumn] = selection;
    // when
    const lines = selectedLines({ startLineNumber, startColumn, endLineNumber, endColumn });
    // then
    expect(lines).toEqual(want);
  });
});

describe('linesLabel', () => {
  test.each([
    { lines: { start: 3, end: 3 }, want: 'line 3' },
    { lines: { start: 2, end: 5 }, want: 'lines 2-5' },
  ])('labels $lines as $want', ({ lines, want }) => {
    // given
    const { start, end } = lines;
    // when
    const label = linesLabel({ start, end });
    // then
    expect(label).toBe(want);
  });
});
