import { folderName } from './folderName';

describe('folderName', () => {
  test.each([
    { path: '/wts/halo-xena-62-config', want: 'halo-xena-62-config' },
    { path: '/wts/maple-mpl-20-file-tree/', want: 'maple-mpl-20-file-tree' },
    { path: 'maple', want: 'maple' },
  ])('names $path by its last folder', ({ path, want }) => {
    // given
    const input = path;
    // when
    const got = folderName(input);
    // then
    expect(got).toBe(want);
  });
});
