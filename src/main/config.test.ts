import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from './config';

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

  test('reports a missing file', async () => {
    // given
    const path = join(dir, 'config.json');
    // when
    const result = await loadConfig(dir);
    // then
    expect(result.data).toBeNull();
    expect(result.error).toBe(`reading config: ${path} does not exist`);
  });
});
