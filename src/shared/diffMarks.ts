import { diffLines } from 'diff';
import type { LineMark } from './types';

function splitLines(value: string): string[] {
  return value.replace(/\n$/, '').split('\n');
}

export function lineMarks(base: string | null, current: string): LineMark[] {
  const marks: LineMark[] = [];
  const hunks = diffLines(base ?? '', current);
  let line = 0;
  for (const [i, hunk] of hunks.entries()) {
    const lines = splitLines(hunk.value);
    if (hunk.removed) {
      if (!hunks.at(i + 1)?.added) {
        marks.push({ kind: 'del', afterLine: line, oldText: lines.join('\n') });
      }
    } else if (!hunk.added) {
      line += lines.length;
    } else {
      const previous = hunks.at(i - 1);
      const removed = i > 0 && previous?.removed ? splitLines(previous.value) : [];
      for (let j = 0; j < lines.length; j++) {
        line += 1;
        marks.push(
          j < removed.length
            ? { kind: 'chg', line, oldText: j === 0 ? removed.join('\n') : null }
            : { kind: 'add', line },
        );
      }
    }
  }
  return marks;
}
