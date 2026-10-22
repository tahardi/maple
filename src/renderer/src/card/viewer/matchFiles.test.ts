import { describe, expect, test } from 'vitest';
import { matchFiles } from './matchFiles';

const many = Array.from({ length: 60 }, (_, i) => `f${String(i)}.ts`);

describe('matchFiles', () => {
  test.each([
    {
      name: 'letters in order anywhere in the path match',
      files: ['src/renderer/src/card/CardTab.tsx', 'src/main/git.ts'],
      query: 'ctab',
      want: ['src/renderer/src/card/CardTab.tsx'],
    },
    {
      name: 'case is ignored',
      files: ['src/README.md', 'src/main.ts'],
      query: 'ReAdMe',
      want: ['src/README.md'],
    },
    {
      name: 'a match in the file name ranks above a match only in the folder path',
      files: ['git/main.ts', 'src/git.ts'],
      query: 'git',
      want: ['src/git.ts', 'git/main.ts'],
    },
    {
      name: 'an empty query returns the first 50 paths',
      files: many,
      query: '',
      want: many.slice(0, 50),
    },
    {
      name: 'results stop at 50',
      files: many,
      query: 'f',
      want: many.slice(0, 50),
    },
  ])('$name', ({ files, query, want }) => {
    // given
    const list: readonly string[] = files;
    // when
    const got = matchFiles(list, query);
    // then
    expect(got).toEqual(want);
  });
});
