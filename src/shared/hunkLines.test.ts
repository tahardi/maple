import { describe, expect, test } from 'vitest';
import { hunkLines } from './hunkLines';

describe('hunkLines', () => {
  test.each<{ name: string; patch: string; expected: [number, number][] }>([
    {
      name: 'one hunk',
      patch: '@@ -1,3 +1,4 @@\n a\n+b\n c\n d',
      expected: [[1, 4]],
    },
    {
      name: 'several hunks',
      patch: '@@ -2,3 +2,3 @@ function a() {\n x\n-y\n+z\n w\n@@ -20,2 +20,5 @@\n p\n+q\n+r\n+s\n t',
      expected: [
        [2, 4],
        [20, 24],
      ],
    },
    {
      name: 'a header with no count',
      patch: '@@ -1 +1 @@\n-a\n+b',
      expected: [[1, 1]],
    },
    {
      name: 'a deletion-only hunk',
      patch: '@@ -1,2 +0,0 @@\n-a\n-b',
      expected: [],
    },
    {
      name: 'an empty patch',
      patch: '',
      expected: [],
    },
  ])('reads the new-side ranges from $name', ({ patch, expected }) => {
    // given
    const input = patch;
    // when
    const ranges = hunkLines(input);
    // then
    expect(ranges).toEqual(expected);
  });
});
