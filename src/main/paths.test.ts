import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { isInside, realOrSelf } from './paths';

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

describe('realOrSelf', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'maple-paths-')));
    mkdirSync(join(root, 'real'));
    symlinkSync(join(root, 'real'), join(root, 'link'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test.each([
    { name: 'a missing file under a symlinked dir', path: 'link/new.txt', expected: 'real/new.txt' },
    { name: 'a missing file under missing dirs', path: 'link/a/b.txt', expected: 'real/a/b.txt' },
    { name: 'an existing dir through a symlink', path: 'link', expected: 'real' },
  ])('resolves $name', async ({ path, expected }) => {
    // given
    const full = join(root, path);
    // when
    const resolved = await realOrSelf(full);
    // then
    expect(resolved).toBe(join(root, expected));
  });
});
