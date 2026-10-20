import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import type { Terminals } from '../terminals';
import { registerJira } from './jira';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle } }));

const project: ProjectConfig = { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 7, plannerDir: '/tmp/halo' };

const sessions = {} as SessionManager;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fixtures = resolve(import.meta.dirname, '../../../test/fixtures/jira');
const deps = {
  window: () => null,
  worktreeFor: () => null,
  project: (k: string) => Promise.resolve(k === 'HALO' ? project : null),
  sessions,
  terminals: {} as Terminals,
  status: {} as StatusEngine,
  setActiveTab: () => undefined,
  warnings: () => [],
  usage: () => null,
  setNotifications: () => Promise.resolve(),
  setZoom: () => Promise.resolve(),
};

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

const TOKEN = 'tok-3f9a1c77e2';

async function writeCreds(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'maple-jira-')), 'env');
  await writeFile(path, `JIRA_SITE=example.atlassian.net\nJIRA_EMAIL=me@example.com\nJIRA_TOKEN=${TOKEN}\n`);
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

function handler(name: string): Handler {
  const call = handle.mock.calls.find(([channel]) => channel === name);
  if (!call) {
    throw new Error(`finding handler: ${name} is not registered`);
  }
  return call[1];
}

function sprintHandler(): Handler {
  return handler('jira:sprint');
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
    { name: 'unreadable creds', channel: 'jira:sprint', key: 'HALO', want: 'reading jira creds:' },
    { name: 'unknown project', channel: 'jira:sprint', key: 'NOPE', want: 'fetching sprint: unknown project NOPE' },
    { name: 'unknown project', channel: 'jira:backlog', key: 'NOPE', want: 'fetching backlog: unknown project NOPE' },
  ])('returns the error for $name on $channel', async ({ channel, key, want }) => {
    // given
    registerJira(deps, logger);
    // when
    const got = await handler(channel)({} as IpcMainInvokeEvent, key);
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
    registerJira(deps, logger);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: { name: 'HALO Sprint 1' }, error: null });
  });

  test('returns the backlog for a known project', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(fixture('backlog-issues.json')))),
    );
    registerJira(deps, logger);
    // when
    const got = await handler('jira:backlog')({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: [{ epic: { key: 'HALO-2' } }, { epic: null }], error: null });
  });

  test('reads creds once at startup', async () => {
    // given
    const path = await writeCreds();
    vi.stubEnv('MAPLE_JIRA_ENV', path);
    vi.stubGlobal(
      'fetch',
      jiraFetch(() => 200),
    );
    registerJira(deps, logger);
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
    registerJira(deps, logger);
    const first = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toEqual({ ...(first as object), error: 'fetching sprint: Jira returned 500' });
  });

  test.each([
    { name: 'a 401', fetchFn: () => Promise.resolve(new Response(TOKEN, { status: 401 })) },
    { name: 'a 500', fetchFn: () => Promise.resolve(new Response(TOKEN, { status: 500 })) },
    { name: 'a bad body', fetchFn: () => Promise.resolve(new Response(JSON.stringify({ values: TOKEN }))) },
    { name: 'a network error', fetchFn: () => Promise.reject(new Error('fetch failed')) },
  ])('never returns the token after $name', async ({ fetchFn }) => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(fetchFn));
    registerJira(deps, logger);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    const serialized = JSON.stringify(got);
    expect(got).toMatchObject({ data: null, error: expect.stringContaining('fetching sprint:') as unknown });
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(Buffer.from(`me@example.com:${TOKEN}`).toString('base64'));
  });

  test('logs unreadable creds at warn', async () => {
    // given
    registerJira(deps, logger);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
      operation: 'readCreds',
      error: expect.stringContaining('reading jira creds:') as unknown,
    });
  });

  test('logs a failed sprint fetch at warn', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal(
      'fetch',
      jiraFetch(() => 500),
    );
    registerJira(deps, logger);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
      operation: 'activeSprint',
      projectKey: 'HALO',
      error: 'fetching sprint: Jira returned 500',
    });
  });

  test('logs nothing when the sprint loads', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal(
      'fetch',
      jiraFetch(() => 200),
    );
    registerJira(deps, logger);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
