import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  changes,
  changedSince,
  currentBranch,
  findWorktree,
  listFiles,
  mergeBase,
  readFilePair,
  searchFiles,
  writeWorktreeFile,
} from './git';

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
  writeFileSync(join(repo, 'logo.bin'), Buffer.from([0x89, 0x00, 0x50]));
  writeFileSync(join(repo, '.gitignore'), 'ignored.log\n');
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

  test('changedSince lists the files that differ from a commit', async () => {
    // given
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\n');
    git(worktree, 'commit', '-am', 'pushed');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim();
    writeFileSync(join(worktree, 'old.txt'), 'r1\n');
    // when
    const paths = await changedSince(worktree, head);
    // then
    expect(paths).toEqual(['old.txt']);
  });

  test('changedSince lists committed and staged files that are newer than the commit', async () => {
    // given
    const pushed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim();
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\n');
    git(worktree, 'commit', '-am', 'not pushed');
    writeFileSync(join(worktree, 'old.txt'), 'r1\n');
    git(worktree, 'add', 'old.txt');
    // when
    const paths = await changedSince(worktree, pushed);
    // then
    expect(paths).toEqual(['keep.txt', 'old.txt']);
  });

  test('changedSince rejects for a commit the repo does not have', async () => {
    // given
    const missing = '0123456789abcdef0123456789abcdef01234567';
    // when
    const result = changedSince(worktree, missing);
    // then
    await expect(result).rejects.toThrow(`running git diff --name-only -z ${missing}`);
  });

  test.each([
    { name: 'a symlink to a device', link: '/dev/zero' },
    { name: 'a symlink pointing out', link: '/etc/passwd' },
  ])('changes counts no lines for $name', async ({ link }) => {
    // given
    symlinkSync(link, join(worktree, 'link'));
    // when
    const set = await changes(worktree);
    // then
    expect(set.files).toEqual([{ path: 'link', status: 'A', oldPath: null }]);
    expect(set.added).toBe(0);
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

  test.each([
    { name: 'a parent path', path: '../repo/keep.txt' },
    { name: 'a deep parent path', path: '../../.ssh/id_rsa' },
    { name: 'an absolute path', path: '/etc/passwd' },
    { name: 'a symlink pointing out', path: 'passwd', link: '/etc/passwd' },
    { name: 'a path through a symlinked dir', path: 'etc/passwd', link: '/etc', linkName: 'etc' },
  ])('readFilePair rejects $name outside the worktree', async ({ path, link, linkName }) => {
    // given
    if (link) {
      symlinkSync(link, join(worktree, linkName ?? path));
    }
    const base = await mergeBase(worktree);
    // when
    const pair = readFilePair(worktree, base, path);
    // then
    await expect(pair).rejects.toThrow('reading file: path is outside the worktree');
  });

  test('writeWorktreeFile replaces a file inside the worktree', async () => {
    // given
    const path = join(worktree, 'keep.txt');
    // when
    await writeWorktreeFile(worktree, 'keep.txt', 'new\n');
    // then
    expect(readFileSync(path, 'utf8')).toBe('new\n');
  });

  test('writeWorktreeFile creates a new file inside the worktree', async () => {
    // given
    const path = join(worktree, 'fresh.txt');
    // when
    await writeWorktreeFile(worktree, 'fresh.txt', 'made\n');
    // then
    expect(readFileSync(path, 'utf8')).toBe('made\n');
  });

  test.each([
    { name: 'a parent path', path: '../repo/keep.txt' },
    { name: 'a deep parent path', path: '../../.ssh/id_rsa' },
    { name: 'an absolute path', path: '/etc/passwd' },
    { name: 'a symlink pointing out', path: 'passwd', link: '/etc/passwd' },
    { name: 'a path through a symlinked dir', path: 'etc/passwd', link: '/etc', linkName: 'etc' },
    { name: 'a new file through a symlinked dir', path: 'etc/maple-new', link: '/etc', linkName: 'etc' },
  ])('writeWorktreeFile rejects $name outside the worktree', async ({ path, link, linkName }) => {
    // given
    if (link) {
      symlinkSync(link, join(worktree, linkName ?? path));
    }
    const passwd = readFileSync('/etc/passwd', 'utf8');
    // when
    const write = writeWorktreeFile(worktree, path, 'x');
    // then
    await expect(write).rejects.toThrow('writing file: path is outside the worktree');
    expect(readFileSync('/etc/passwd', 'utf8')).toBe(passwd);
  });

  test('readFilePair follows a symlink that stays inside the worktree', async () => {
    // given
    symlinkSync('keep.txt', join(worktree, 'alias.txt'));
    const base = await mergeBase(worktree);
    // when
    const pair = await readFilePair(worktree, base, 'alias.txt');
    // then
    expect(pair).toEqual({ kind: 'text', path: 'alias.txt', base: null, current: 'a\nb\nc\n' });
  });

  test('findWorktree finds the worktree dir by card key', async () => {
    // given
    const worktreesDir = join(root, 'wts');
    // when
    const found = await findWorktree(worktreesDir, 'MPL-1');
    // then
    expect(found).toBe(worktree);
  });

  test('changes is empty on a branch with no edits', async () => {
    // given
    const clean = worktree;
    // when
    const set = await changes(clean);
    // then
    expect(set).toEqual({ base: await mergeBase(clean), files: [], added: 0, removed: 0 });
  });

  test('changes counts untracked lines and skips ignored files', async () => {
    // given
    writeFileSync(join(worktree, 'no-newline.txt'), 'u1\nu2');
    writeFileSync(join(worktree, 'blob.bin'), Buffer.from([0x00, 0x0a, 0x0a]));
    writeFileSync(join(worktree, 'ignored.log'), 'i1\ni2\n');
    // when
    const set = await changes(worktree);
    // then
    expect(set.files.map((file) => file.path).sort()).toEqual(['blob.bin', 'no-newline.txt']);
    expect(set.added).toBe(2);
  });

  test('readFilePair handles new files, binary base files, and the size limit', async () => {
    // given
    writeFileSync(join(worktree, 'fresh.txt'), 'f\n');
    writeFileSync(join(worktree, 'logo.bin'), 'now text\n');
    writeFileSync(join(worktree, 'limit.txt'), 'a'.repeat(2_097_152));
    const base = await mergeBase(worktree);
    // when
    const [fresh, logo, limit] = await Promise.all(
      ['fresh.txt', 'logo.bin', 'limit.txt'].map((path) => readFilePair(worktree, base, path)),
    );
    // then
    expect(fresh).toEqual({ kind: 'text', path: 'fresh.txt', base: null, current: 'f\n' });
    expect(logo).toEqual({ kind: 'binary', path: 'logo.bin' });
    expect(limit.kind).toBe('text');
  });

  test('listFiles lists tracked and untracked files but not ignored ones', async () => {
    // given
    writeFileSync(join(worktree, 'untracked.txt'), 'u\n');
    writeFileSync(join(worktree, 'ignored.log'), 'i\n');
    // when
    const files = await listFiles(worktree);
    // then
    expect(files.sort()).toEqual(['.gitignore', 'del.txt', 'keep.txt', 'logo.bin', 'old.txt', 'untracked.txt']);
  });

  test('searchFiles finds text in tracked and untracked files but not ignored ones', async () => {
    // given
    writeFileSync(join(worktree, 'keep.txt'), 'a\nthe needle here\n');
    git(worktree, 'commit', '-am', 'needle');
    writeFileSync(join(worktree, 'untracked.txt'), 'Needle first\n');
    writeFileSync(join(worktree, 'ignored.log'), 'needle\n');
    // when
    const hits = await searchFiles(worktree, 'NEEDLE');
    // then
    expect([...hits].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'keep.txt', line: 2, text: 'the needle here' },
      { path: 'untracked.txt', line: 1, text: 'Needle first' },
    ]);
  });

  test('searchFiles returns no hits when nothing matches', async () => {
    // given
    const query = 'nothing-like-this';
    // when
    const hits = await searchFiles(worktree, query);
    // then
    expect(hits).toEqual([]);
  });

  test('searchFiles treats a query starting with a dash as text', async () => {
    // given
    writeFileSync(join(worktree, 'untracked.txt'), 'run --force now\n');
    // when
    const hits = await searchFiles(worktree, '--force');
    // then
    expect(hits).toEqual([{ path: 'untracked.txt', line: 1, text: 'run --force now' }]);
  });

  test('searchFiles caps the hits at 500 and each line at 200 characters', async () => {
    // given
    writeFileSync(join(worktree, 'untracked.txt'), `needle${'x'.repeat(300)}\n`.repeat(600));
    // when
    const hits = await searchFiles(worktree, 'needle');
    // then
    expect(hits).toHaveLength(500);
    expect(hits[0]).toEqual({ path: 'untracked.txt', line: 1, text: `needle${'x'.repeat(194)}` });
  });

  test('currentBranch returns the checked out branch', async () => {
    // given
    const feature = worktree;
    // when
    const branch = await currentBranch(feature);
    // then
    expect(branch).toBe('feature');
  });

  test('mergeBase rejects when origin/main is missing', async () => {
    // given
    git(worktree, 'update-ref', '-d', 'refs/remotes/origin/main');
    // when
    const base = mergeBase(worktree);
    // then
    await expect(base).rejects.toThrow('running git merge-base origin/main HEAD');
  });

  test('findWorktree returns null when no dir matches the key', async () => {
    // given
    const worktreesDir = join(root, 'wts');
    // when
    const found = await findWorktree(worktreesDir, 'MPL-2');
    // then
    expect(found).toBeNull();
  });
});
