import type { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { ghRunner, projectRunner } from './ghRunner';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Callback = (error: { code?: string | number } | null, stdout: string, stderr: string) => void;

function fakeExecFile(error: { code?: string | number } | null, stdout = '', stderr = '') {
  const fake = vi.fn((_cmd: string, _args: string[], _options: object, callback: Callback) => {
    callback(error, stdout, stderr);
  });
  return { fake, run: fake as unknown as typeof execFile };
}

type RepoReply = { error?: { code?: string | number }; stdout?: string; stderr?: string };

function fakeRepos(replies: Partial<Record<string, RepoReply>>) {
  const repoOf = (options: object) => (options as { env: { GH_REPO: string } }).env.GH_REPO;
  const fake = vi.fn((_cmd: string, _args: string[], options: object, callback: Callback) => {
    const reply = replies[repoOf(options)] ?? {};
    callback(reply.error ?? null, reply.stdout ?? '', reply.stderr ?? '');
  });
  const repos = () => fake.mock.calls.map(([, , options]) => repoOf(options));
  return { fake, repos, run: fake as unknown as typeof execFile };
}

describe('ghRunner', () => {
  test('runs with GH_REPO set and no working directory', async () => {
    // given
    const { fake, run } = fakeExecFile(null, 'ok');
    // when
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'list'], '/home/dev/wts/x');
    // then
    expect(fake).toHaveBeenCalledWith(
      'gh',
      ['pr', 'list'],
      { env: expect.objectContaining({ GH_REPO: 'tahardi/maple' }) as unknown, maxBuffer: 64 * 1024 * 1024 },
      expect.any(Function),
    );
    expect(fake.mock.calls[0]?.[2]).not.toHaveProperty('cwd');
    expect(result).toEqual({ code: 0, stdout: 'ok', stderr: '' });
  });

  test('overrides a GH_REPO already in the environment', async () => {
    // given
    vi.stubEnv('GH_REPO', 'someone/else');
    const { fake, run } = fakeExecFile(null);
    // when
    await ghRunner('tahardi/maple', run)('gh', ['pr', 'list']);
    // then
    expect(fake.mock.calls[0]?.[2]).toMatchObject({ env: { GH_REPO: 'tahardi/maple' } });
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'a missing command as 127', error: { code: 'ENOENT' }, code: 127 },
    { name: 'a numeric exit code', error: { code: 3 }, code: 3 },
    { name: 'any other failure as 1', error: {}, code: 1 },
  ])('reports $name', async ({ error, code }) => {
    // given
    const { run } = fakeExecFile(error, '', 'boom');
    // when
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'list']);
    // then
    expect(result).toEqual({ code, stdout: '', stderr: 'boom' });
  });
});

describe('projectRunner', () => {
  const project = {
    name: 'Dig Days',
    jiraKey: 'DIG',
    jiraBoardId: 1,
    plannerDir: '/tmp/dig',
    repo: 'tahardi/dig-days',
    otherRepos: [],
  };
  const byKey = (key: string) => Promise.resolve(key === 'DIG' ? project : null);

  test('runs gh against the project repo', async () => {
    // given
    const { fake, run } = fakeExecFile(null);
    // when
    await (
      await projectRunner(byKey, 'DIG', null, null, run)
    )('gh', ['pr', 'list']);
    // then
    expect(fake.mock.calls[0]?.[2]).toMatchObject({ env: { GH_REPO: 'tahardi/dig-days' } });
  });

  test.each([
    { key: 'HALO', branch: null, want: 'finding project repo: unknown project HALO' },
    { key: 'HALO', branch: 'xena-92-go-caches', want: 'finding project repo: unknown project HALO' },
    { key: null, branch: 'xena-92-go-caches', want: 'finding project repo: tab has no project' },
  ])('rejects project $key with branch $branch', async ({ key, branch, want }) => {
    // given
    const { fake, run } = fakeExecFile(null);
    // when
    const result = projectRunner(byKey, key, branch, null, run);
    // then
    await expect(result).rejects.toThrow(new RegExp(`^${want}$`));
    expect(fake).not.toHaveBeenCalled();
  });

  const branch = 'xena-92-go-caches';
  const probe = [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
    '--limit',
    '100',
    '--json',
    'isCrossRepository,state',
  ];
  const xena = { ...project, jiraKey: 'XENA', repo: 'tahardi/xena', otherRepos: ['tahardi/dotclaude'] };
  const three = { ...xena, otherRepos: ['tahardi/dotclaude', 'tahardi/halo'] };
  const none = '[]';
  const found = '[{"isCrossRepository":false,"state":"OPEN"}]';
  const merged = '[{"isCrossRepository":false,"state":"MERGED"}]';
  const forkOpenOwnMerged = '[{"isCrossRepository":true,"state":"OPEN"},{"isCrossRepository":false,"state":"MERGED"}]';

  test.each([
    {
      name: 'uses the project repo when the branch is null',
      config: xena,
      head: null,
      worktree: null,
      replies: {},
      want: ['tahardi/xena'],
    },
    {
      name: 'uses the project repo when it has no other repos',
      config: project,
      head: branch,
      worktree: null,
      replies: {},
      want: ['tahardi/dig-days'],
    },
    {
      name: 'uses the first listed repo with a PR for the branch',
      config: xena,
      head: branch,
      worktree: null,
      replies: { 'tahardi/xena': { stdout: none }, 'tahardi/dotclaude': { stdout: found } },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/dotclaude'],
    },
    {
      name: 'stops probing at the first repo with an open PR',
      config: three,
      head: branch,
      worktree: null,
      replies: {
        'tahardi/xena': { stdout: none },
        'tahardi/dotclaude': { stdout: found },
        'tahardi/halo': { stdout: found },
      },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/dotclaude'],
    },
    {
      name: 'prefers the project repo when both have a PR',
      config: xena,
      head: branch,
      worktree: null,
      replies: { 'tahardi/xena': { stdout: found }, 'tahardi/dotclaude': { stdout: found } },
      want: ['tahardi/xena', 'tahardi/xena'],
    },
    {
      name: 'skips a repo whose only PR for the branch comes from a fork',
      config: xena,
      head: branch,
      worktree: null,
      replies: {
        'tahardi/xena': { stdout: fixture('pr-list-fork-only.json') },
        'tahardi/dotclaude': { stdout: found },
      },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/dotclaude'],
    },
    {
      name: 'uses a repo with a same-repo PR listed behind a fork PR',
      config: xena,
      head: branch,
      worktree: null,
      replies: {
        'tahardi/xena': { stdout: fixture('pr-list-fork-first.json') },
        'tahardi/dotclaude': { stdout: found },
      },
      want: ['tahardi/xena', 'tahardi/xena'],
    },
    {
      name: 'falls back to the project repo when no repo has a PR',
      config: xena,
      head: branch,
      worktree: null,
      replies: { 'tahardi/xena': { stdout: none }, 'tahardi/dotclaude': { stdout: none } },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/xena'],
    },
    {
      name: 'prefers an open PR in a later repo over a merged PR in an earlier one',
      config: three,
      head: branch,
      worktree: null,
      replies: {
        'tahardi/xena': { stdout: merged },
        'tahardi/dotclaude': { stdout: none },
        'tahardi/halo': { stdout: found },
      },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/halo', 'tahardi/halo'],
    },
    {
      name: 'uses the first repo with a merged PR when none is open',
      config: three,
      head: branch,
      worktree: null,
      replies: {
        'tahardi/xena': { stdout: none },
        'tahardi/dotclaude': { stdout: merged },
        'tahardi/halo': { stdout: merged },
      },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/halo', 'tahardi/dotclaude'],
    },
    {
      name: 'ignores an open fork PR when choosing between merged PRs',
      config: three,
      head: branch,
      worktree: null,
      replies: {
        'tahardi/xena': { stdout: merged },
        'tahardi/dotclaude': { stdout: forkOpenOwnMerged },
        'tahardi/halo': { stdout: merged },
      },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/halo', 'tahardi/xena'],
    },
    {
      name: 'uses the repo named by the worktree folder without probing',
      config: three,
      head: branch,
      worktree: '/wts/halo-xena-92-go-caches',
      replies: { 'tahardi/xena': { stdout: found }, 'tahardi/halo': { stdout: found } },
      want: ['tahardi/halo'],
    },
    {
      name: 'uses the project repo when the worktree folder names it',
      config: three,
      head: branch,
      worktree: '/wts/xena-xena-92-go-caches',
      replies: { 'tahardi/xena': { stdout: found }, 'tahardi/halo': { stdout: found } },
      want: ['tahardi/xena'],
    },
    {
      name: 'probes every repo when the worktree folder names none of them',
      config: xena,
      head: branch,
      worktree: '/wts/other-xena-92-x',
      replies: { 'tahardi/xena': { stdout: none }, 'tahardi/dotclaude': { stdout: found } },
      want: ['tahardi/xena', 'tahardi/dotclaude', 'tahardi/dotclaude'],
    },
  ])('$name', async ({ config, head, worktree, replies, want }) => {
    // given
    const { fake, repos, run } = fakeRepos(replies);
    // when
    const runner = await projectRunner(() => Promise.resolve(config), config.jiraKey, head, worktree, run);
    await runner('gh', ['pr', 'view']);
    // then
    expect(repos()).toEqual(want);
    expect(fake.mock.calls.slice(0, -1).map(([, args]) => args)).toEqual(want.slice(0, -1).map(() => probe));
  });

  test.each([
    {
      name: 'in the project repo',
      replies: { 'tahardi/xena': { error: { code: 1 }, stderr: 'boom' } },
      want: 'finding project repo: listing PRs in tahardi/xena: boom',
    },
    {
      name: 'in a later repo',
      replies: { 'tahardi/xena': { stdout: none }, 'tahardi/dotclaude': { error: { code: 1 }, stderr: 'boom' } },
      want: 'finding project repo: listing PRs in tahardi/dotclaude: boom',
    },
  ])('reports a failed probe $name', async ({ replies, want }) => {
    // given
    const { run } = fakeRepos(replies);
    // when
    const result = projectRunner(() => Promise.resolve(xena), 'XENA', branch, null, run);
    // then
    await expect(result).rejects.toThrow(want);
  });

  test.each([
    { name: 'invalid JSON', stdout: 'not json' },
    { name: 'a non-array', stdout: '{"isCrossRepository":false}' },
    { name: 'an entry without the fork flag', stdout: '[{"number":8}]' },
  ])('rejects a probe that prints $name', async ({ stdout }) => {
    // given
    const { repos, run } = fakeRepos({ 'tahardi/xena': { stdout }, 'tahardi/dotclaude': { stdout: found } });
    // when
    const result = projectRunner(() => Promise.resolve(xena), 'XENA', branch, null, run);
    // then
    await expect(result).rejects.toThrow();
    expect(repos()).toEqual(['tahardi/xena']);
  });
});
