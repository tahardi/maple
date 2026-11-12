import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { changes, mergeBase } from './changes';
import { buildRepo, gitIn } from './testRepo';

describe('changes', () => {
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
    gitIn(worktree, 'mv', 'old.txt', 'renamed.txt');
    gitIn(worktree, 'add', '.');
    gitIn(worktree, 'commit', '-m', 'feature');
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\nd\n');
    unlinkSync(join(worktree, 'del.txt'));
    writeFileSync(join(worktree, 'untracked.txt'), 'u1\nu2\nu3\n');
    // when
    const set = await changes(worktree);
    // then
    expect(set?.base).toBe(await mergeBase(worktree));
    expect([...(set?.files ?? [])].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'del.txt', status: 'D', oldPath: null, stamp: null },
      { path: 'keep.txt', status: 'M', oldPath: null, stamp: expect.any(String) as string },
      { path: 'new.txt', status: 'A', oldPath: null, stamp: expect.any(String) as string },
      { path: 'renamed.txt', status: 'R', oldPath: 'old.txt', stamp: expect.any(String) as string },
      { path: 'untracked.txt', status: 'A', oldPath: null, stamp: expect.any(String) as string },
    ]);
    expect(set?.added).toBe(7);
    expect(set?.removed).toBe(2);
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
    expect(set?.files).toEqual([{ path: 'link', status: 'A', oldPath: null, stamp: expect.any(String) as string }]);
    expect(set?.added).toBe(0);
  });

  test('changes gives a file a new stamp when it is rewritten', async () => {
    // given
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\n');
    writeFileSync(join(worktree, 'untracked.txt'), 'u1\n');
    const before = await changes(worktree);
    const later = new Date(Date.now() + 60_000);
    // when
    writeFileSync(join(worktree, 'keep.txt'), 'a\nB\nc\n');
    utimesSync(join(worktree, 'keep.txt'), later, later);
    const after = await changes(worktree);
    // then
    const stampOf = (set: typeof before, path: string) => set?.files.find((file) => file.path === path)?.stamp;
    expect(stampOf(after, 'keep.txt')).not.toBe(stampOf(before, 'keep.txt'));
    expect(stampOf(after, 'untracked.txt')).toBe(stampOf(before, 'untracked.txt'));
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
    expect(set?.files.map((file) => file.path).sort()).toEqual(['blob.bin', 'no-newline.txt']);
    expect(set?.added).toBe(2);
  });

  test('mergeBase returns null when no default branch exists', async () => {
    // given
    gitIn(worktree, 'remote', 'remove', 'origin');
    gitIn(worktree, 'update-ref', '-d', 'refs/heads/main');
    // when
    const base = await mergeBase(worktree);
    // then
    expect(base).toBeNull();
  });

  test('mergeBase returns null when HEAD shares no history with the default branch', async () => {
    // given
    gitIn(worktree, 'checkout', '--orphan', 'unrelated');
    gitIn(worktree, 'commit', '-m', 'unrelated');
    // when
    const base = await mergeBase(worktree);
    // then
    expect(base).toBeNull();
  });

  test('mergeBase keeps the default branch it found', async () => {
    // given
    const first = await mergeBase(worktree);
    gitIn(worktree, 'commit', '--allow-empty', '-m', 'trunk');
    gitIn(worktree, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    gitIn(worktree, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    // when
    const base = await mergeBase(worktree);
    // then
    expect(base).toBe(first);
  });

  test('mergeBase looks again when the default branch it found is gone', async () => {
    // given
    await mergeBase(worktree);
    gitIn(worktree, 'commit', '--allow-empty', '-m', 'trunk');
    gitIn(worktree, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    gitIn(worktree, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    gitIn(worktree, 'update-ref', '-d', 'refs/remotes/origin/main');
    // when
    const base = await mergeBase(worktree);
    // then
    expect(base).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim());
  });

  test('changes returns null when no default branch exists', async () => {
    // given
    gitIn(worktree, 'remote', 'remove', 'origin');
    gitIn(worktree, 'update-ref', '-d', 'refs/heads/main');
    // when
    const set = await changes(worktree);
    // then
    expect(set).toBeNull();
  });

  test('changes does not run the core.fsmonitor command from repo config', async () => {
    // given
    const marker = join(root, 'fsmonitor-ran');
    const script = join(root, 'fsmonitor.sh');
    writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
    gitIn(worktree, 'config', 'core.fsmonitor', script);
    // when
    await changes(worktree);
    // then
    expect(existsSync(marker)).toBe(false);
  });

  test.each([
    { kind: 'clean', filter: 'plain' },
    { kind: 'process', filter: 'plain' },
    { kind: 'clean', filter: 'with=equals' },
  ])('changes does not run a $kind command from repo filter $filter', async ({ kind, filter }) => {
    // given
    const marker = join(root, 'filter-ran');
    const script = join(root, 'filter.sh');
    writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\ncat\n`, { mode: 0o755 });
    gitIn(worktree, 'config', `filter.${filter}.${kind}`, script);
    gitIn(worktree, 'config', `filter.${filter}.required`, 'true');
    writeFileSync(join(worktree, '.gitattributes'), `keep.txt filter=${filter}\n`);
    writeFileSync(join(worktree, 'keep.txt'), 'changed\n');
    // when
    const set = await changes(worktree);
    // then
    expect(existsSync(marker)).toBe(false);
    expect(set?.files.map((file) => file.path)).toContain('keep.txt');
  });

  test('plain git diff runs the core.fsmonitor command from repo config', () => {
    // given
    const marker = join(root, 'fsmonitor-ran');
    const script = join(root, 'fsmonitor.sh');
    writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
    gitIn(worktree, 'config', 'core.fsmonitor', script);
    // when
    gitIn(worktree, 'diff', '--name-status');
    // then
    expect(existsSync(marker)).toBe(true);
  });
});
