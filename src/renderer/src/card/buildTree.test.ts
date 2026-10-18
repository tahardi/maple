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
});
