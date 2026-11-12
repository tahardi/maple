import { closeFiles } from './closeFiles';

describe('closeFiles', () => {
  test.each([
    {
      name: 'closes an inactive file and keeps the active one',
      active: 'a.ts',
      paths: ['b.ts'],
      open: ['a.ts', 'c.ts'],
      next: 'a.ts',
    },
    {
      name: 'closes the active file and activates the last one left',
      active: 'c.ts',
      paths: ['c.ts'],
      open: ['a.ts', 'b.ts'],
      next: 'b.ts',
    },
    {
      name: 'closes the others and keeps the chosen file active',
      active: 'a.ts',
      paths: ['a.ts', 'c.ts'],
      open: ['b.ts'],
      next: 'b.ts',
    },
    {
      name: 'closes every file and clears the active one',
      active: 'b.ts',
      paths: ['a.ts', 'b.ts', 'c.ts'],
      open: [],
      next: null,
    },
    {
      name: 'closes the others around the active file and keeps it active',
      active: 'b.ts',
      paths: ['a.ts', 'c.ts'],
      open: ['b.ts'],
      next: 'b.ts',
    },
    {
      name: 'leaves no active file when none was active',
      active: null,
      paths: ['a.ts'],
      open: ['b.ts', 'c.ts'],
      next: null,
    },
    {
      name: 'ignores a path that is not open',
      active: 'a.ts',
      paths: ['z.ts'],
      open: ['a.ts', 'b.ts', 'c.ts'],
      next: 'a.ts',
    },
    {
      name: 'changes nothing when no paths are given',
      active: 'a.ts',
      paths: [],
      open: ['a.ts', 'b.ts', 'c.ts'],
      next: 'a.ts',
    },
  ])('$name', ({ active, paths, open, next }) => {
    // given
    const openFiles = ['a.ts', 'b.ts', 'c.ts'];
    // when
    const result = closeFiles(openFiles, active, paths);
    // then
    expect(result).toEqual({ openFiles: open, activeFile: next });
  });
});
