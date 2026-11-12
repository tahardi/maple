import { mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findWorktrees } from './findWorktrees';
import { buildRepo } from './testRepo';

describe('findWorktrees', () => {
  let root: string;
  let worktree: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maple-git-'));
    worktree = buildRepo(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('findWorktrees lists every worktree dir for the card key', async () => {
    // given
    const worktreesDir = join(root, 'wts');
    // when
    const found = await findWorktrees(worktreesDir, 'MPL-1');
    // then
    expect(found).toEqual([worktree]);
  });

  test('findWorktrees lists the newest worktree first', async () => {
    // given
    const worktreesDir = join(root, 'wts');
    const other = join(worktreesDir, 'other-mpl-1-x');
    mkdirSync(other);
    const later = new Date(Date.now() + 60_000);
    utimesSync(other, later, later);
    // when
    const found = await findWorktrees(worktreesDir, 'MPL-1');
    // then
    expect(found).toEqual([other, worktree]);
  });

  test('findWorktrees returns no dirs when none match the key', async () => {
    // given
    const worktreesDir = join(root, 'wts');
    // when
    const found = await findWorktrees(worktreesDir, 'MPL-2');
    // then
    expect(found).toEqual([]);
  });
});
