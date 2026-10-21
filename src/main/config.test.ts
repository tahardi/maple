import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { configDir, expandHome, loadConfig } from './config';

const validConfig = {
  worktreesDir: '~/Documents/code/wts',
  notifications: true,
  projects: [
    { name: 'Dig Days', jiraKey: 'DIG', jiraBoardId: 2, plannerDir: '~/Documents/code/dig-days' },
    { name: 'Bearclave', jiraKey: 'BEAR', jiraBoardId: 5, plannerDir: '~/Documents/code' },
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
      name: 'string jiraBoardId',
      content: JSON.stringify(stringBoardId),
      error: /^reading config: projects\.0\.jiraBoardId/,
    },
    {
      name: 'a negative reviewPoints',
      content: JSON.stringify({ ...validConfig, reviewPoints: -1 }),
      error: /^reading config: reviewPoints:/,
    },
    {
      name: 'a fractional reviewPoints',
      content: JSON.stringify({ ...validConfig, reviewPoints: 2.5 }),
      error: /^reading config: reviewPoints:/,
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

  test('defaults reviewPoints to 20', async () => {
    // given
    await writeFile(join(dir, 'config.json'), JSON.stringify(validConfig));
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.error).toBeNull();
    expect(result.data?.reviewPoints).toBe(20);
  });

  test.each([{ reviewPoints: 30 }, { reviewPoints: 0 }])(
    'reads reviewPoints $reviewPoints from the file',
    async ({ reviewPoints }) => {
      // given
      await writeFile(join(dir, 'config.json'), JSON.stringify({ ...validConfig, reviewPoints }));
      // when
      const result = await loadConfig(dir);
      // then
      expect(result.error).toBeNull();
      expect(result.data?.reviewPoints).toBe(reviewPoints);
    },
  );

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
