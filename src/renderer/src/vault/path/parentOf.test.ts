import { parentOf } from './parentOf';

describe('parentOf', () => {
  test.each([
    { path: 'Inbox.md', parent: '' },
    { path: 'Projects/Plan.md', parent: 'Projects' },
    { path: 'Projects/Maple/Spike.md', parent: 'Projects/Maple' },
  ])('gives $parent for $path', ({ path, parent }) => {
    // given
    const input = path;
    // when
    const got = parentOf(input);
    // then
    expect(got).toBe(parent);
  });
});
