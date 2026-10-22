const HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

export function hunkLines(patch: string): readonly [number, number][] {
  return [...patch.matchAll(HEADER)].flatMap(([, start, count = '1']): [number, number][] =>
    count === '0' ? [] : [[Number(start), Number(start) + Number(count) - 1]],
  );
}
