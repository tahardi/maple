import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Fetched } from '@shared/types/app/fetched';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import { notificationsDefault, projectByKey, reloadConfig } from './configCache';

const { loadConfig } = vi.hoisted(() => ({ loadConfig: vi.fn() }));

vi.mock('@main/app/config/config', () => ({ loadConfig }));

const first = { data: null, error: 'reading config: missing', fetchedAt: null };
const halo: ProjectConfig = {
  name: 'Halo',
  jiraKey: 'HALO',
  jiraBoardId: 7,
  plannerDir: '/tmp/halo',
  repo: 'tahardi/halo',
  otherRepos: [],
};
const dig: ProjectConfig = {
  name: 'Dig Days',
  jiraKey: 'DIG',
  jiraBoardId: 8,
  plannerDir: '/tmp/dig',
  repo: 'tahardi/dig-days',
  otherRepos: [],
};
const loaded = (projects: ProjectConfig[], notifications = true): Fetched<MapleConfig> => ({
  data: {
    worktreesDir: '/tmp/wts',
    vaultDir: null,
    notifications,
    backgroundWaitMinutes: 15,
    eventKeepDays: 365,
    eventMaxMegabytes: 200,
    stateBackups: 3,
    startAtOnce: 4,
    maxWorking: 8,
    maxLoadPerCore: 0.8,
    minFreeMegabytes: 2048,
    projects,
    actions: [],
  },
  error: null,
  fetchedAt: '2026-10-18T00:00:00.000Z',
});

describe('projectByKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { name: 'a known key', loads: [loaded([halo])], reload: false, key: 'HALO', want: halo },
    { name: 'an unknown key', loads: [loaded([halo])], reload: false, key: 'NOPE', want: null },
    { name: 'a failed load', loads: [first], reload: false, key: 'HALO', want: null },
    { name: 'a reloaded config', loads: [loaded([halo]), loaded([dig])], reload: true, key: 'DIG', want: dig },
  ])('returns the project for $name', async ({ loads, reload, key, want }) => {
    // given
    loadConfig.mockReset();
    loads.forEach((result) => loadConfig.mockResolvedValueOnce(result));
    await reloadConfig();
    if (reload) {
      await reloadConfig();
    }
    // when
    const got = await projectByKey(key);
    // then
    expect(got).toEqual(want);
  });

  test('returns null before the config loads', async () => {
    // given
    vi.resetModules();
    const fresh = await import('./configCache');
    // when
    const got = await fresh.projectByKey('HALO');
    // then
    expect(got).toBeNull();
    expect(loadConfig).not.toHaveBeenCalled();
  });
});

describe('notificationsDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { name: 'a config with notifications on', loads: [loaded([halo], true)], reload: false, want: true },
    { name: 'a config with notifications off', loads: [loaded([halo], false)], reload: false, want: false },
    { name: 'a failed load', loads: [first], reload: false, want: true },
    {
      name: 'a reload that turns them off',
      loads: [loaded([halo], true), loaded([halo], false)],
      reload: true,
      want: false,
    },
  ])('follows $name', async ({ loads, reload, want }) => {
    // given
    loadConfig.mockReset();
    loads.forEach((result) => loadConfig.mockResolvedValueOnce(result));
    await reloadConfig();
    if (reload) {
      await reloadConfig();
    }
    // when
    const got = await notificationsDefault();
    // then
    expect(got).toBe(want);
  });

  test('defaults to on before the config loads', async () => {
    // given
    vi.resetModules();
    const fresh = await import('./configCache');
    // when
    const got = await fresh.notificationsDefault();
    // then
    expect(got).toBe(true);
  });
});
