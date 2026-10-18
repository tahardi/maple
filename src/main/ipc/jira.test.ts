import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import { registerJira } from './jira';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle } }));

const project: ProjectConfig = { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 7, plannerDir: '/tmp/halo' };

const sessions = {} as SessionManager;
const fixtures = resolve(import.meta.dirname, '../../../test/fixtures/jira');
const deps = {
  window: () => null,
  worktreeFor: () => null,
  project: (k: string) => Promise.resolve(k === 'HALO' ? project : null),
  sessions,
  status: {} as StatusEngine,
  setActiveTab: () => undefined,
  setNotifications: () => Promise.resolve(),
};

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

async function writeCreds(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'maple-jira-')), 'env');
  await writeFile(path, 'JIRA_SITE=example.atlassian.net\nJIRA_EMAIL=me@example.com\nJIRA_TOKEN=secret\n');
  return path;
}

function jiraFetch(issuesStatus: () => number): typeof fetch {
  return vi.fn<typeof fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith('/sprint')) {
      return Promise.resolve(new Response(fixture('board-sprint-active.json')));
    }
    const status = issuesStatus();
    return Promise.resolve(new Response(status === 200 ? fixture('sprint-issues.json') : '', { status }));
  });
}

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
    vi.unstubAllGlobals();
  });

  test.each([
    { name: 'unreadable creds', key: 'HALO', want: 'reading jira creds:' },
    { name: 'unknown project', key: 'NOPE', want: 'fetching sprint: unknown project NOPE' },
  ])('returns the error for $name', async ({ key, want }) => {
    // given
    registerJira(deps);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, key);
    // then
    expect(got).toMatchObject({ data: null, fetchedAt: null, error: expect.stringContaining(want) as unknown });
  });

  test('returns the active sprint for a known project', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal(
      'fetch',
      jiraFetch(() => 200),
    );
    registerJira(deps);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: { name: 'HALO Sprint 1' }, error: null });
  });

  test('reads creds once at startup', async () => {
    // given
    const path = await writeCreds();
    vi.stubEnv('MAPLE_JIRA_ENV', path);
    vi.stubGlobal(
      'fetch',
      jiraFetch(() => 200),
    );
    registerJira(deps);
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    await rm(path);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: { name: 'HALO Sprint 1' }, error: null });
  });

  test('keeps the last sprint when Jira fails', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    const statuses = [200, 500];
    vi.stubGlobal(
      'fetch',
      jiraFetch(() => statuses.shift() ?? 500),
    );
    registerJira(deps);
    const first = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toEqual({ ...(first as object), error: 'fetching sprint: Jira returned 500' });
  });
});
