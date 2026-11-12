import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { Sprint } from '@shared/types/jira/sprint';
import { SprintCache } from './SprintCache';

const project: ProjectConfig = {
  name: 'Halo',
  jiraKey: 'HALO',
  jiraBoardId: 7,
  plannerDir: '/tmp/halo',
  repo: 'tahardi/halo',
  otherRepos: [],
};
const sprint: Sprint = { id: 6, name: 'HALO Sprint 1', startDate: '2026-10-12', endDate: '2026-10-26', cards: [] };

type Load = (p: ProjectConfig) => Promise<Sprint | null>;

describe('SprintCache', () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = Date.UTC(2026, 10, 11);
  });

  test('success sets fetchedAt and a null error', async () => {
    // given
    const cache = new SprintCache(() => Promise.resolve(sprint), 15_000, now);
    // when
    const got = await cache.get(project);
    // then
    expect(got.data).toEqual(sprint);
    expect(got.error).toBeNull();
    expect(got.fetchedAt).not.toBeNull();
  });

  test('success then failure keeps the old data and fetchedAt with the new error', async () => {
    // given
    const load = vi
      .fn<(p: ProjectConfig) => Promise<Sprint | null>>()
      .mockResolvedValueOnce(sprint)
      .mockRejectedValueOnce(new Error('fetching sprint: Jira returned 500'));
    const cache = new SprintCache(load, 15_000, now);
    const first = await cache.get(project);
    clock += 15_001;
    // when
    const got = await cache.get(project);
    // then
    expect(got).toEqual({ data: sprint, fetchedAt: first.fetchedAt, error: 'fetching sprint: Jira returned 500' });
  });

  test('failure with nothing cached returns null data and the error', async () => {
    // given
    const cache = new SprintCache(() => Promise.reject(new Error('fetching sprint: offline')), 15_000, now);
    // when
    const got = await cache.get(project);
    // then
    expect(got).toEqual({ data: null, fetchedAt: null, error: 'fetching sprint: offline' });
  });

  test('a get within the time-to-live reuses the last load', async () => {
    // given
    const load = vi.fn<Load>(() => Promise.resolve(sprint));
    const cache = new SprintCache(load, 15_000, now);
    const first = await cache.get(project);
    clock += 14_000;
    // when
    const got = await cache.get(project);
    // then
    expect(load).toHaveBeenCalledTimes(1);
    expect(got.fetchedAt).toBe(first.fetchedAt);
  });

  test('a get after the time-to-live loads again', async () => {
    // given
    const load = vi.fn<Load>(() => Promise.resolve(sprint));
    const cache = new SprintCache(load, 15_000, now);
    await cache.get(project);
    clock += 15_001;
    // when
    await cache.get(project);
    // then
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('gets made while a load runs share it', async () => {
    // given
    let finish: (value: Sprint | null) => void = () => undefined;
    const load = vi.fn<Load>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const cache = new SprintCache(load, 15_000, now);
    // when
    const gets = Promise.all([cache.get(project), cache.get(project)]);
    finish(sprint);
    const [a, b] = await gets;
    // then
    expect(load).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual(sprint);
    expect(b.data).toEqual(sprint);
  });

  test('a get after a failure loads again', async () => {
    // given
    const load = vi.fn<Load>().mockRejectedValueOnce(new Error('fetching sprint: offline')).mockResolvedValue(sprint);
    const cache = new SprintCache(load, 15_000, now);
    await cache.get(project);
    // when
    const got = await cache.get(project);
    // then
    expect(load).toHaveBeenCalledTimes(2);
    expect(got).toMatchObject({ data: sprint, error: null });
  });

  test('clear makes the next get load again', async () => {
    // given
    const load = vi.fn<Load>(() => Promise.resolve(sprint));
    const cache = new SprintCache(load, 15_000, now);
    await cache.get(project);
    // when
    cache.clear();
    await cache.get(project);
    // then
    expect(load).toHaveBeenCalledTimes(2);
  });
});
