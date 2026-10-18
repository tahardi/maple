import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types';
import { registerJira } from './jira';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle } }));

const project: ProjectConfig = { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 7, plannerDir: '/tmp/halo' };

function sprintHandler(): Handler {
  const call = handle.mock.calls.find(([channel]) => channel === 'jira:sprint');
  if (!call) {
    throw new Error('finding handler: jira:sprint is not registered');
  }
  return call[1];
}

describe('registerJira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MAPLE_JIRA_ENV', join(tmpdir(), 'maple-missing-jira-env'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'unreadable creds', key: 'HALO', want: 'reading jira creds:' },
    { name: 'unknown project', key: 'NOPE', want: 'fetching sprint: unknown project NOPE' },
  ])('returns the error for $name', async ({ key, want }) => {
    // given
    registerJira({ window: () => null, worktreeFor: () => null, project: (k) => (k === 'HALO' ? project : null) });
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, key);
    // then
    expect(got).toMatchObject({ data: null, fetchedAt: null, error: expect.stringContaining(want) as unknown });
  });
});
