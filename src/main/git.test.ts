import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { changes, findWorktree, mergeBase, readFilePair } from './git';

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'ignore' },
  );
}

function buildRepo(root: string): string {
  const origin = join(root, 'origin.git');
  const repo = join(root, 'repo');
  const worktree = join(root, 'wts', 'maple-mpl-1-feature');
  mkdirSync(repo);
  git(root, 'init', '--bare', '-b', 'main', origin);
  git(repo, 'init', '-b', 'main');
  writeFileSync(join(repo, 'keep.txt'), 'a\nb\nc\n');
  writeFileSync(join(repo, 'del.txt'), 'x\n');
  writeFileSync(join(repo, 'old.txt'), 'r1\nr2\nr3\nr4\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'main');
  git(repo, 'remote', 'add', 'origin', origin);
  git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'worktree', 'add', worktree, '-b', 'feature', 'origin/main');
  return worktree;
}

describe('git', () => {
  let root: string;
  let worktree: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maple-git-'));
    worktree = buildRepo(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('changes lists committed, uncommitted, and untracked files with line counts', async () => {
    // given
    writeFileSync(join(worktree, 'new.txt'), 'n1\nn2\n');
    git(worktree, 'mv', 'old.txt', 'renamed.txt');
    git(worktree, 'add', '.');
    git(worktree, 'commit', '-m', 'feature');
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\nd\n');
    unlinkSync(join(worktree, 'del.txt'));
    writeFileSync(join(worktree, 'untracked.txt'), 'u1\nu2\nu3\n');
    // when
    const set = await changes(worktree);
    // then
    expect(set.base).toBe(await mergeBase(worktree));
    expect([...set.files].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'del.txt', status: 'D', oldPath: null },
      { path: 'keep.txt', status: 'M', oldPath: null },
      { path: 'new.txt', status: 'A', oldPath: null },
      { path: 'renamed.txt', status: 'R', oldPath: 'old.txt' },
      { path: 'untracked.txt', status: 'A', oldPath: null },
    ]);
    expect(set.added).toBe(7);
    expect(set.removed).toBe(2);
  });

  test('readFilePair returns text, deleted, binary, and too large pairs', async () => {
    // given
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\n');
    unlinkSync(join(worktree, 'del.txt'));
    writeFileSync(join(worktree, 'bin.dat'), Buffer.from([0x61, 0x00, 0x62]));
    writeFileSync(join(worktree, 'big.txt'), 'a'.repeat(3 * 1024 * 1024));
    const base = await mergeBase(worktree);
    // when
    const pairs = await Promise.all(
      ['keep.txt', 'del.txt', 'bin.dat', 'big.txt'].map((path) => readFilePair(worktree, base, path)),
    );
    // then
    expect(pairs).toEqual([
      { kind: 'text', path: 'keep.txt', base: 'a\nb\nc\n', current: 'a\nB\nc\n' },
      { kind: 'text', path: 'del.txt', base: 'x\n', current: null },
      { kind: 'binary', path: 'bin.dat' },
      { kind: 'tooLarge', path: 'big.txt', bytes: 3 * 1024 * 1024 },
    ]);
  });

  test('readFilePair rejects paths outside the worktree', async () => {
    // given
    const base = await mergeBase(worktree);
    // when
    const pair = readFilePair(worktree, base, '../repo/keep.txt');
    // then
    await expect(pair).rejects.toThrow('reading file: ../repo/keep.txt is outside the worktree');
  });

  test('findWorktree finds the worktree dir by card key', async () => {
    // given
    const worktreesDir = join(root, 'wts');
    // when
    const found = await findWorktree(worktreesDir, 'MPL-1');
    // then
    expect(found).toBe(worktree);
  });
});
