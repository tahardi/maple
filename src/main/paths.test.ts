import { describe, expect, test } from 'vitest';
import { isInside } from './paths';

describe('isInside', () => {
  test.each([
    { name: 'a child', root: '/a/b', full: '/a/b/c.md', expected: true },
    { name: 'the root itself', root: '/a/b', full: '/a/b', expected: true },
    { name: 'the parent', root: '/a/b', full: '/a', expected: false },
    { name: 'a parent path', root: '/a/b', full: '/a/b/../c', expected: false },
    { name: 'a sibling with a shared prefix', root: '/a/b', full: '/a/bc', expected: false },
  ])('returns $expected for $name', ({ root, full, expected }) => {
    // given
    const path = full;
    // when
    const inside = isInside(root, path);
    // then
    expect(inside).toBe(expected);
  });
});
