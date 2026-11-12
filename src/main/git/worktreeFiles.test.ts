import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mergeBase } from './changes';
import { listFiles, readFilePair, searchFiles, writeWorktreeFile } from './worktreeFiles';
import { buildRepo, gitIn } from './testRepo';

describe('worktreeFiles', () => {
  let root: string;
  let worktree: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maple-git-'));
    worktree = buildRepo(root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  test('readFilePair returns text, deleted, binary, and too large pairs', async () => {
    // given
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\n');
    unlinkSync(join(worktree, 'del.txt'));
    writeFileSync(join(worktree, 'bin.dat'), Buffer.from([0x61, 0x00, 0x62]));
    writeFileSync(join(worktree, 'big.txt'), 'a'.repeat(3 * 1024 * 1024));
    const base = (await mergeBase(worktree)) ?? 'HEAD';
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
    const base = (await mergeBase(worktree)) ?? 'HEAD';
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
    const base = (await mergeBase(worktree)) ?? 'HEAD';
    // when
    const pair = await readFilePair(worktree, base, 'alias.txt');
    // then
    expect(pair).toEqual({ kind: 'text', path: 'alias.txt', base: null, current: 'a\nb\nc\n' });
  });

  test('readFilePair handles new files, binary base files, and the size limit', async () => {
    // given
    writeFileSync(join(worktree, 'fresh.txt'), 'f\n');
    writeFileSync(join(worktree, 'logo.bin'), 'now text\n');
    writeFileSync(join(worktree, 'limit.txt'), 'a'.repeat(2_097_152));
    const base = (await mergeBase(worktree)) ?? 'HEAD';
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

  test('listFiles does not run the core.fsmonitor command from repo config', async () => {
    // given
    const marker = join(root, 'fsmonitor-ran');
    const script = join(root, 'fsmonitor.sh');
    writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
    gitIn(worktree, 'config', 'core.fsmonitor', script);
    // when
    await listFiles(worktree);
    // then
    expect(existsSync(marker)).toBe(false);
  });

  test('searchFiles finds text in tracked and untracked files but not ignored ones', async () => {
    // given
    writeFileSync(join(worktree, 'keep.txt'), 'a\nthe needle here\n');
    gitIn(worktree, 'commit', '-am', 'needle');
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

  test('readFilePair runs git show with fsmonitor turned off', async () => {
    // given
    const log = join(root, 'git-args.log');
    const bin = join(root, 'bin');
    const realGit = join(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), 'git');
    mkdirSync(bin);
    writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$*" >> "${log}"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
    vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`);
    // when
    await readFilePair(worktree, 'HEAD', 'keep.txt');
    // then
    expect(readFileSync(log, 'utf8')).toBe('-c core.fsmonitor=false show HEAD:keep.txt\n');
  });
});
