import { describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config';
import type { Sprint } from '@shared/types/jira';
import { SprintCache } from './sprintCache';

const project: ProjectConfig = { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 7, plannerDir: '/tmp/halo' };
const sprint: Sprint = { id: 6, name: 'HALO Sprint 1', startDate: '2026-10-12', endDate: '2026-10-26', cards: [] };

describe('SprintCache', () => {
  test('success sets fetchedAt and a null error', async () => {
    // given
    const cache = new SprintCache(() => Promise.resolve(sprint));
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
    const cache = new SprintCache(load);
    const first = await cache.get(project);
    // when
    const got = await cache.get(project);
    // then
    expect(got).toEqual({ data: sprint, fetchedAt: first.fetchedAt, error: 'fetching sprint: Jira returned 500' });
  });

  test('failure with nothing cached returns null data and the error', async () => {
    // given
    const cache = new SprintCache(() => Promise.reject(new Error('fetching sprint: offline')));
    // when
    const got = await cache.get(project);
    // then
    expect(got).toEqual({ data: null, fetchedAt: null, error: 'fetching sprint: offline' });
  });
});
