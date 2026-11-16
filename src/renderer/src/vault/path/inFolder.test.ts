import { inFolder } from './inFolder';

describe('inFolder', () => {
  test.each([
    { folder: '', name: 'Plan.md', path: 'Plan.md' },
    { folder: 'Projects', name: 'Plan.md', path: 'Projects/Plan.md' },
    { folder: 'Projects/Maple', name: 'Ideas', path: 'Projects/Maple/Ideas' },
  ])('puts $name in "$folder" as $path', ({ folder, name, path }) => {
    // given
    const input = { folder, name };
    // when
    const got = inFolder(input.folder, input.name);
    // then
    expect(got).toBe(path);
  });
});
