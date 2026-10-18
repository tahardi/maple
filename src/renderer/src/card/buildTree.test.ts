import type { FileChange } from '@shared/types';
import { buildTree, type TreeNode } from './buildTree';

const changes: FileChange[] = [
  { path: 'src/b.ts', status: 'M', oldPath: null },
  { path: 'src/old.ts', status: 'D', oldPath: null },
];
const paths = ['README.md', 'src/a.ts', 'src/b.ts', 'src/lib/c.ts'];

const file = (path: string, status: TreeNode['status'] = null): TreeNode => ({
  name: path.split('/').at(-1) ?? path,
  path,
  dir: false,
  status,
  children: [],
});
const dir = (path: string, children: TreeNode[]): TreeNode => ({
  name: path.split('/').at(-1) ?? path,
  path,
  dir: true,
  status: null,
  children,
});

describe('buildTree', () => {
  test.each([
    {
      name: 'changed files and their parent folders when changedOnly',
      changedOnly: true,
      expected: [dir('src', [file('src/b.ts', 'M'), file('src/old.ts', 'D')])],
    },
    {
      name: 'all files with changed ones marked, folders first',
      changedOnly: false,
      expected: [
        dir('src', [
          dir('src/lib', [file('src/lib/c.ts')]),
          file('src/a.ts'),
          file('src/b.ts', 'M'),
          file('src/old.ts', 'D'),
        ]),
        file('README.md'),
      ],
    },
  ])('builds $name', ({ changedOnly, expected }) => {
    // given
    const input = { paths, changes };
    // when
    const tree = buildTree(input.paths, input.changes, changedOnly);
    // then
    expect(tree).toEqual(expected);
  });

  test.each([
    { name: 'no files', paths: [], changes: [], changedOnly: false, expected: [] },
    {
      name: 'a renamed file at the root',
      paths: ['new.ts'],
      changes: [{ path: 'new.ts', status: 'R' as const, oldPath: 'old.ts' }],
      changedOnly: true,
      expected: [file('new.ts', 'R')],
    },
    {
      name: 'a deeply nested changed file',
      paths: ['a/b/c/d.ts', 'a/e.ts'],
      changes: [{ path: 'a/b/c/d.ts', status: 'A' as const, oldPath: null }],
      changedOnly: true,
      expected: [dir('a', [dir('a/b', [dir('a/b/c', [file('a/b/c/d.ts', 'A')])])])],
    },
    {
      name: 'folders before files and names in order at the root',
      paths: ['b.ts', 'z/x.ts', 'a.ts', 'm/y.ts'],
      changes: [],
      changedOnly: false,
      expected: [dir('m', [file('m/y.ts')]), dir('z', [file('z/x.ts')]), file('a.ts'), file('b.ts')],
    },
  ])('handles $name', ({ paths: input, changes: changed, changedOnly, expected }) => {
    // given
    const args = { input, changed };
    // when
    const tree = buildTree(args.input, args.changed, changedOnly);
    // then
    expect(tree).toEqual(expected);
  });
});
