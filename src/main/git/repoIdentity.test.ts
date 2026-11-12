import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { commitExists, currentBranch, defaultBranch, gitCommonDir, headSha, repoName } from './repoIdentity';
import { buildRepo, gitIn } from './testRepo';

const timeout = vi.hoisted(() => ({ ms: 30_000 }));

vi.mock('@main/util/commandTimeout', () => ({
  get COMMAND_TIMEOUT_MS() {
    return timeout.ms;
  },
  MERGE_TIMEOUT_MS: 120_000,
}));

describe('repoIdentity', () => {
  let root: string;
  let worktree: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maple-git-'));
    worktree = buildRepo(root);
  });

  afterEach(() => {
    timeout.ms = 30_000;
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  test.each([
    { url: 'https://github.com/taylor/maple.git', want: 'maple' },
    { url: 'git@github.com:taylor/maple.git', want: 'maple' },
    { url: 'https://github.com/taylor/maple', want: 'maple' },
    { url: 'https://github.com/taylor/maple/', want: 'maple' },
    { url: 'https://github.com/taylor/maple.git/', want: 'maple' },
    { url: 'git@example.com:maple.git', want: 'maple' },
    { url: 'https://github.com/taylor/taylor.github.io', want: 'taylor.github.io' },
  ])('repoName returns $want for origin $url', async ({ url, want }) => {
    // given
    gitIn(worktree, 'remote', 'set-url', 'origin', url);
    // when
    const name = await repoName(worktree);
    // then
    expect(name).toBe(want);
  });

  test('gitCommonDir returns the main checkout git dir for a worktree', async () => {
    // given
    const repo = join(root, 'repo');
    // when
    const dir = await gitCommonDir(worktree);
    // then
    expect(dir).toBe(join(realpathSync(repo), '.git'));
  });

  test('repoName falls back to the main checkout folder without an origin remote', async () => {
    // given
    gitIn(worktree, 'remote', 'remove', 'origin');
    // when
    const name = await repoName(worktree);
    // then
    expect(name).toBe('repo');
  });

  test('repoName rejects outside a git repo', async () => {
    // given
    const plain = join(root, 'plain');
    mkdirSync(plain);
    // when
    const got = repoName(plain);
    // then
    await expect(got).rejects.toThrow('running git rev-parse');
  });

  test('currentBranch returns the checked out branch', async () => {
    // given
    const feature = worktree;
    // when
    const branch = await currentBranch(feature);
    // then
    expect(branch).toBe('feature');
  });

  test.each([
    {
      name: 'origin/HEAD points at trunk',
      want: 'origin/trunk',
      setup: (wt: string) => {
        gitIn(wt, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD');
        gitIn(wt, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
      },
    },
    { name: 'only origin/main exists', want: 'origin/main', setup: () => undefined },
    {
      name: 'origin/main is missing',
      want: 'origin/master',
      setup: (wt: string) => {
        gitIn(wt, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
        gitIn(wt, 'update-ref', '-d', 'refs/remotes/origin/main');
      },
    },
    {
      name: 'origin/HEAD points at a deleted branch',
      want: 'origin/main',
      setup: (wt: string) => {
        gitIn(wt, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/gone');
      },
    },
    {
      name: 'origin has neither main nor master',
      want: 'main',
      setup: (wt: string) => {
        gitIn(wt, 'update-ref', '-d', 'refs/remotes/origin/main');
      },
    },
    {
      name: 'there is no origin',
      want: 'main',
      setup: (wt: string) => {
        gitIn(wt, 'remote', 'remove', 'origin');
      },
    },
    {
      name: 'only a local master exists',
      want: 'master',
      setup: (wt: string) => {
        gitIn(wt, 'remote', 'remove', 'origin');
        gitIn(wt, 'update-ref', 'refs/heads/master', 'refs/heads/main');
        gitIn(wt, 'update-ref', '-d', 'refs/heads/main');
      },
    },
    {
      name: 'no default branch exists',
      want: null,
      setup: (wt: string) => {
        gitIn(wt, 'remote', 'remove', 'origin');
        gitIn(wt, 'update-ref', '-d', 'refs/heads/main');
      },
    },
  ])('defaultBranch returns $want when $name', async ({ want, setup }) => {
    // given
    setup(worktree);
    // when
    const branch = await defaultBranch(worktree);
    // then
    expect(branch).toBe(want);
  });

  test('currentBranch rejects when git runs past the timeout', async () => {
    // given
    timeout.ms = 50;
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
    vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`);
    // when
    const result = currentBranch(worktree);
    // then
    await expect(result).rejects.toThrow('running git rev-parse --abbrev-ref HEAD: timing out after 50ms');
  });

  test('headSha returns the commit HEAD points at', async () => {
    // given
    const want = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim();
    // when
    const sha = await headSha(worktree);
    // then
    expect(sha).toBe(want);
  });

  test('headSha rejects outside a git repo', async () => {
    // given
    const outside = root;
    // when
    const sha = headSha(outside);
    // then
    await expect(sha).rejects.toThrow();
  });

  test.each([
    { name: 'an existing branch', ref: 'main', want: true },
    { name: 'a missing name', ref: 'nope', want: false },
    { name: 'a tree', ref: 'HEAD^{tree}', want: false },
  ])('commitExists returns $want for $name', async ({ ref, want }) => {
    // given
    const name = ref;
    // when
    const got = await commitExists(worktree, name);
    // then
    expect(got).toBe(want);
  });
});
