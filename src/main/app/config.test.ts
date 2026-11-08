import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { configDir, expandHome, loadConfig } from './config';

const validConfig = {
  worktreesDir: '~/Documents/code/wts',
  notifications: true,
  projects: [
    {
      name: 'Dig Days',
      jiraKey: 'DIG',
      jiraBoardId: 2,
      plannerDir: '~/Documents/code/dig-days',
      repo: 'tahardi/dig-days',
    },
    { name: 'Bearclave', jiraKey: 'BEAR', jiraBoardId: 5, plannerDir: '~/Documents/code', repo: 'tahardi/bearclave' },
  ],
  actions: [
    { label: 'Address review', prompt: '/card {key}' },
    { label: 'Merge main', prompt: 'Run the "Sync with Main" steps from the /card skill for {key}.' },
  ],
};

const withoutActions = { ...validConfig, actions: undefined };
const withoutNotifications = { ...validConfig, notifications: undefined };
const duplicateKey = { ...validConfig, projects: [validConfig.projects[0], validConfig.projects[0]] };
const stringBoardId = { ...validConfig, projects: [{ ...validConfig.projects[0], jiraBoardId: '2' }] };

describe('configDir', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'MAPLE_CONFIG_DIR when set', env: '/tmp/maple', expected: '/tmp/maple' },
    { name: '~/.config/maple by default', env: undefined, expected: join(homedir(), '.config', 'maple') },
  ])('returns $name', ({ env, expected }) => {
    // given
    vi.stubEnv('MAPLE_CONFIG_DIR', env);
    // when
    const dir = configDir();
    // then
    expect(dir).toBe(expected);
  });
});

describe('expandHome', () => {
  test.each([
    { input: '~', expected: homedir() },
    { input: '~/code', expected: join(homedir(), 'code') },
    { input: '/abs/path', expected: '/abs/path' },
    { input: '~other/code', expected: '~other/code' },
    { input: 'a/~/b', expected: 'a/~/b' },
  ])('expands $input', ({ input, expected }) => {
    // given
    const path = input;
    // when
    const expanded = expandHome(path);
    // then
    expect(expanded).toBe(expected);
  });
});

describe('loadConfig', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-config-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('loads a valid config with expanded paths', async () => {
    // given
    await writeFile(join(dir, 'config.json'), JSON.stringify(validConfig));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.error).toBeNull();
    expect(result.data?.projects[0]?.plannerDir).toBe(join(homedir(), 'Documents/code/dig-days'));
    expect(result.data?.worktreesDir).toBe(join(homedir(), 'Documents/code/wts'));
    expect(result.fetchedAt).not.toBeNull();
  });

  test.each([
    {
      name: 'expanded when set',
      vaultDir: '~/Documents/obsidian-vault',
      expected: join(homedir(), 'Documents/obsidian-vault'),
    },
    { name: 'null when missing', vaultDir: undefined, expected: null },
  ])('vaultDir is $name', async ({ vaultDir, expected }) => {
    // given
    await writeFile(join(dir, 'config.json'), JSON.stringify({ ...validConfig, vaultDir }));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.error).toBeNull();
    expect(result.data?.vaultDir).toBe(expected);
  });

  test.each([
    { name: 'actions missing', config: withoutActions, check: { actions: validConfig.actions } },
    { name: 'notifications missing', config: withoutNotifications, check: { notifications: true } },
    { name: 'backgroundWaitMinutes missing', config: validConfig, check: { backgroundWaitMinutes: 10 } },
    { name: 'eventKeepDays missing', config: validConfig, check: { eventKeepDays: 365 } },
    { name: 'eventMaxMegabytes missing', config: validConfig, check: { eventMaxMegabytes: 200 } },
  ])('defaults when $name', async ({ config, check }) => {
    // given
    await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject(check);
  });

  test.each([
    { name: 'invalid JSON', content: '{', error: /^parsing config:/ },
    {
      name: 'empty projects',
      content: JSON.stringify({ ...validConfig, projects: [] }),
      error: /^reading config: projects must not be empty$/,
    },
    {
      name: 'duplicate jiraKey',
      content: JSON.stringify(duplicateKey),
      error: /^reading config: duplicate jiraKey DIG$/,
    },
    {
      name: 'a non-string vaultDir',
      content: JSON.stringify({ ...validConfig, vaultDir: 7 }),
      error: /^reading config: vaultDir:/,
    },
    {
      name: 'a backgroundWaitMinutes of zero',
      content: JSON.stringify({ ...validConfig, backgroundWaitMinutes: 0 }),
      error: /^reading config: backgroundWaitMinutes:/,
    },
    {
      name: 'an eventKeepDays of zero',
      content: JSON.stringify({ ...validConfig, eventKeepDays: 0 }),
      error: /^reading config: eventKeepDays:/,
    },
    {
      name: 'a fractional eventKeepDays',
      content: JSON.stringify({ ...validConfig, eventKeepDays: 1.5 }),
      error: /^reading config: eventKeepDays:/,
    },
    {
      name: 'an eventMaxMegabytes of zero',
      content: JSON.stringify({ ...validConfig, eventMaxMegabytes: 0 }),
      error: /^reading config: eventMaxMegabytes:/,
    },
    {
      name: 'string jiraBoardId',
      content: JSON.stringify(stringBoardId),
      error: /^reading config: projects\.0\.jiraBoardId/,
    },
  ])('reports $name', async ({ content, error }) => {
    // given
    await writeFile(join(dir, 'config.json'), content);
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data).toBeNull();
    expect(result.error).toMatch(error);
  });

  test('accepts a repo with dots and underscores', async () => {
    // given
    const config = { ...validConfig, projects: [{ ...validConfig.projects[0], repo: 'my_org/site.github.io' }] };
    await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data?.projects[0]?.repo).toBe('my_org/site.github.io');
  });

  test.each([
    { repo: 'dig-days', want: 'must be owner/name' },
    { repo: '-x/y', want: 'must be owner/name' },
    { repo: 'a/b/c', want: 'must be owner/name' },
    { repo: '../..', want: 'must be owner/name' },
    { repo: './x', want: 'must be owner/name' },
    { repo: undefined, want: 'Invalid input: expected string, received undefined' },
  ])('rejects repo $repo', async ({ repo, want }) => {
    // given
    const config = { ...validConfig, projects: [{ ...validConfig.projects[0], repo }] };
    await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data).toBeNull();
    expect(result.error).toBe(`reading config: projects.0.repo: ${want}`);
  });

  test('defaults otherRepos to empty', async () => {
    // given
    await writeFile(join(dir, 'config.json'), JSON.stringify(validConfig));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data?.projects[0]?.otherRepos).toEqual([]);
  });

  test('accepts otherRepos', async () => {
    // given
    const otherRepos = ['tahardi/dotclaude'];
    const config = { ...validConfig, projects: [{ ...validConfig.projects[0], otherRepos }] };
    await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data?.projects[0]?.otherRepos).toEqual(otherRepos);
  });

  test.each([{ repo: 'dotclaude' }, { repo: '-x/y' }, { repo: 'a/b/c' }, { repo: '../x' }])(
    'rejects other repo $repo',
    async ({ repo }) => {
      // given
      const config = { ...validConfig, projects: [{ ...validConfig.projects[0], otherRepos: [repo] }] };
      await writeFile(join(dir, 'config.json'), JSON.stringify(config));
      // when
      const result = await loadConfig(dir);
      // then
      expect(result.data).toBeNull();
      expect(result.error).toBe('reading config: projects.0.otherRepos.0: must be owner/name');
    },
  );

  test.each([
    {
      name: 'a plain string',
      otherRepos: 'tahardi/dotclaude',
      want: 'projects.0.otherRepos: Invalid input: expected array, received string',
    },
    {
      name: 'a bad later entry',
      otherRepos: ['tahardi/dotclaude', 'bad'],
      want: 'projects.0.otherRepos.1: must be owner/name',
    },
  ])('rejects otherRepos given $name', async ({ otherRepos, want }) => {
    // given
    const config = { ...validConfig, projects: [{ ...validConfig.projects[0], otherRepos }] };
    await writeFile(join(dir, 'config.json'), JSON.stringify(config));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data).toBeNull();
    expect(result.error).toBe(`reading config: ${want}`);
  });

  test('reports a missing file', async () => {
    // given
    const path = join(dir, 'config.json');
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data).toBeNull();
    expect(result.error).toBe(`reading config: ${path} does not exist`);
  });

  test('logs the project count on load', async () => {
    // given
    await writeFile(join(dir, 'config.json'), JSON.stringify(validConfig));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    await loadConfig(dir, logger);
    // then
    expect(logger.info).toHaveBeenCalledWith('config', 'loaded', { projects: 2 });
  });

  test('logs the error when loading fails', async () => {
    // given
    await writeFile(join(dir, 'config.json'), '{');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    const result = await loadConfig(dir, logger);
    // then
    expect(logger.error).toHaveBeenCalledWith('config', 'failed', { error: result.error });
    expect(logger.info).not.toHaveBeenCalled();
  });
});
