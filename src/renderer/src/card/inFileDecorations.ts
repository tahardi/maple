import type { LineMark } from '@shared/types';

export type DecorationSpec = {
  startLine: number;
  endLine: number;
  className: string;
  marginClassName: string;
  overviewColor: string;
  hover: string | null;
};

function was(oldText: string | null): string | null {
  if (oldText === null) {
    return null;
  }
  const longest = (oldText.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `Was:\n${fence}\n${oldText}\n${fence}`;
}

function toDecoration(mark: LineMark): DecorationSpec {
  switch (mark.kind) {
    case 'add':
      return {
        startLine: mark.line,
        endLine: mark.line,
        className: 'line-add',
        marginClassName: 'margin-add',
        overviewColor: '#57ab5a',
        hover: null,
      };
    case 'chg':
      return {
        startLine: mark.line,
        endLine: mark.line,
        className: 'line-chg',
        marginClassName: 'margin-chg',
        overviewColor: '#d4b106',
        hover: was(mark.oldText),
      };
    case 'del': {
      const line = Math.max(mark.afterLine, 1);
      return {
        startLine: line,
        endLine: line,
        className: mark.afterLine === 0 ? 'del-above' : 'del-below',
        marginClassName: 'margin-del',
        overviewColor: '#e5534b',
        hover: was(mark.oldText),
      };
    }
  }
}

export function toDecorations(marks: readonly LineMark[]): DecorationSpec[] {
  return marks.map(toDecoration);
}
