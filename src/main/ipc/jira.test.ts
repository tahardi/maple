import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import { JiraClient } from '@main/jira/JiraClient';
import type { JiraCreds } from '@main/jira/readCreds';
import { registerJira } from './jira';
import type { StartQueue } from '@main/sessions/StartQueue';
import { errorText } from '@shared/errors/errorText';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const { handle, removeSnapshots, sessionOf } = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  removeSnapshots: vi.fn<(sessionId: string) => Promise<void>>(),
  sessionOf: vi.fn<(cardKey: string) => string | null>(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/vault/snapshots', () => ({ removeSnapshots }));

const project: ProjectConfig = {
  name: 'Halo',
  jiraKey: 'HALO',
  jiraBoardId: 7,
  plannerDir: '/tmp/halo',
  repo: 'tahardi/halo',
  otherRepos: [],
};

const sessions = { sessionOf } as unknown as SessionManager;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fixtures = resolve(import.meta.dirname, '../../../test/fixtures/jira');
const base = {
  window: () => null,
  worktreeFor: () => null,
  project: (k: string) => Promise.resolve(k === 'HALO' ? project : null),
  sessions,
  terminals: {} as Terminals,
  status: {} as StatusEngine,
  setActiveTab: () => undefined,
  warnings: () => [],
  setNotifications: () => Promise.resolve(),
  setZoom: () => Promise.resolve(),
  configLoaded: () => Promise.resolve(),
  setLastProject: () => Promise.resolve(),
  lastProject: () => Promise.resolve(null),
  setSeen: () => Promise.resolve(),
  seen: () => Promise.resolve({}),
  watchVault: () => undefined,
  startQueue: new EventEmitter() as StartQueue,
  prs: { latest: () => Promise.resolve({ data: null, error: null, fetchedAt: null }), refresh: () => undefined },
  findingsDir: '/tmp/maple/findings',
};

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

const TOKEN = 'tok-3f9a1c77e2';

const creds: JiraCreds = { site: 'https://example.atlassian.net', email: 'me@example.com', token: TOKEN };

function rejected<T>(err: Error): Promise<T> {
  const promise = Promise.reject(err);
  promise.catch(() => undefined);
  return promise;
}

function withJira(fetchFn: typeof fetch) {
  return { ...base, jira: Promise.resolve(new JiraClient(creds, fetchFn, logger)), jiraCreds: Promise.resolve(creds) };
}

function withoutCreds() {
  const err = new Error('reading jira creds: JIRA_TOKEN is missing');
  return { ...base, jira: rejected<JiraClient>(err), jiraCreds: rejected<JiraCreds>(err) };
}

function jiraFetch(issuesStatus: () => number): typeof fetch {
  return vi.fn<typeof fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith('/sprint')) {
      return Promise.resolve(new Response(fixture('board-sprint-active.json')));
    }
    if (url.pathname.endsWith('/epic')) {
      return Promise.resolve(new Response(fixture('board-epics.json')));
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
    sessionOf.mockReset().mockReturnValue(null);
    removeSnapshots.mockReset().mockResolvedValue(undefined);
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
    registerJira(withoutCreds(), logger);
    // when
    const got = await handler(channel)({} as IpcMainInvokeEvent, key);
    // then
    expect(got).toMatchObject({ data: null, fetchedAt: null, error: expect.stringContaining(want) as unknown });
  });

  test('returns the active sprint for a known project', async () => {
    // given
    registerJira(withJira(jiraFetch(() => 200)), logger);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: { name: 'HALO Sprint 1' }, error: null });
  });

  test('deletes no snapshots when it reads the sprint', async () => {
    // given
    sessionOf.mockImplementation((key) => `s-${key}`);
    registerJira(withJira(jiraFetch(() => 200)), logger);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(removeSnapshots).not.toHaveBeenCalled();
  });

  test('fetches with the client from the deps and reads no creds file', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', join(tmpdir(), 'maple-no-creds', 'env'));
    registerJira(withJira(jiraFetch(() => 200)), logger);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: { name: 'HALO Sprint 1' }, error: null });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('returns the backlog for a known project', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>((input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const name = url.pathname === '/rest/agile/1.0/board/7/epic' ? 'board-epics.json' : 'backlog-issues.json';
      return Promise.resolve(new Response(fixture(name)));
    });
    registerJira(withJira(fetchFn), logger);
    // when
    const got = await handler('jira:backlog')({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: [{ epic: { key: 'HALO-2', color: 'purple' } }, { epic: null }], error: null });
  });

  test('keeps the last sprint when Jira fails', async () => {
    // given
    const statuses = [200, 500];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 11));
    registerJira(withJira(jiraFetch(() => statuses.shift() ?? 500)), logger);
    const first = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    vi.setSystemTime(Date.UTC(2026, 10, 11, 0, 0, 16));
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    vi.useRealTimers();
    expect(got).toEqual({ ...(first as object), error: 'fetching sprint: Jira returned 500' });
  });

  test('moveToSprint makes the next sprint read go to Jira', async () => {
    // given
    const fetchFn = jiraFetch(() => 200);
    registerJira(withJira(fetchFn), logger);
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    await handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    const sprintFetches = vi
      .mocked(fetchFn)
      .mock.calls.filter(([input]) =>
        new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith('/board/7/sprint'),
      );
    expect(sprintFetches).toHaveLength(2);
  });

  test.each([
    { name: 'a 401', fetchFn: () => Promise.resolve(new Response(TOKEN, { status: 401 })) },
    { name: 'a 500', fetchFn: () => Promise.resolve(new Response(TOKEN, { status: 500 })) },
    { name: 'a bad body', fetchFn: () => Promise.resolve(new Response(JSON.stringify({ values: TOKEN }))) },
    { name: 'a network error', fetchFn: () => Promise.reject(new Error('fetch failed')) },
  ])('never returns the token after $name', async ({ fetchFn }) => {
    // given
    registerJira(withJira(vi.fn<typeof fetch>(fetchFn)), logger);
    // when
    const got = await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    const serialized = JSON.stringify(got);
    expect(got).toMatchObject({ data: null, error: expect.stringContaining('fetching sprint:') as unknown });
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(Buffer.from(`me@example.com:${TOKEN}`).toString('base64'));
  });

  test('moveToSprint moves the cards with the startup creds', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
    registerJira(withJira(fetchFn), logger);
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // when
    await handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']);
    // then
    const [input, init] = fetchFn.mock.calls.at(-1) ?? [];
    expect(input).toBe('https://example.atlassian.net/rest/agile/1.0/sprint/6/issue');
    expect(init?.body).toBe('{"issues":["HALO-20"]}');
    expect(logger.warn).not.toHaveBeenCalledWith(
      'jira',
      'failed',
      expect.objectContaining({ operation: 'jira:moveToSprint' }),
    );
  });

  test.each([
    { name: 'a lower case key', args: [6, ['halo-20']] },
    { name: 'an empty list', args: [6, []] },
    { name: 'a fractional sprint id', args: [6.5, ['HALO-20']] },
    { name: 'a zero sprint id', args: [0, ['HALO-20']] },
    { name: 'a string sprint id', args: ['6', ['HALO-20']] },
    { name: 'more than 50 keys', args: [6, Array.from({ length: 51 }, (_, i) => `HALO-${String(i + 1)}`)] },
    { name: 'a missing key list', args: [6] },
  ])('moveToSprint rejects $name', async ({ args }) => {
    // given
    registerJira(withoutCreds(), logger);
    // when
    const got = Promise.resolve().then(() => handler('jira:moveToSprint')({} as IpcMainInvokeEvent, ...args));
    // then
    await expect(got).rejects.toThrow('handling jira:moveToSprint: arguments are invalid');
  });

  test('moveToSprint rejects with the creds error when creds are unreadable', async () => {
    // given
    registerJira(withoutCreds(), logger);
    // when
    const got = handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']);
    // then
    await expect(got).rejects.toThrow('reading jira creds:');
  });

  test.each([
    { name: 'a 400', fetchFn: () => Promise.resolve(new Response(TOKEN, { status: 400 })) },
    { name: 'a network error', fetchFn: () => Promise.reject(new Error('fetch failed')) },
  ])('moveToSprint never rejects with the token after $name', async ({ fetchFn }) => {
    // given
    registerJira(withJira(vi.fn<typeof fetch>(fetchFn)), logger);
    // when
    const got = await handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']).catch(
      (err: unknown) => err,
    );
    // then
    const message = errorText(got);
    expect(message).toContain('moving cards to sprint:');
    expect(message).not.toContain(TOKEN);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
  });

  test('logs a failed move at warn', async () => {
    // given
    registerJira(withJira(vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 400 })))), logger);
    // when
    const got = handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']);
    // then
    await expect(got).rejects.toThrow('moving cards to sprint: Jira returned 400');
    expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
      operation: 'jira:moveToSprint',
      error: 'moving cards to sprint: Jira returned 400',
    });
  });

  test('logs unreadable creds at warn', async () => {
    // given
    registerJira(withoutCreds(), logger);
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
    registerJira(withJira(jiraFetch(() => 500)), logger);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
      operation: 'activeSprint',
      projectKey: 'HALO',
      error: 'fetching sprint: Jira returned 500',
    });
  });

  describe('jira:report', () => {
    type Posted = {
      fields: { project: { key: string }; labels: string[]; parent?: { key: string }; description: Doc };
    };
    type Doc = { content: { type: string; content?: { text?: string }[] }[] };

    function createFetch(status = 200): typeof fetch {
      return vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(status === 200 ? fixture('create-issue.json') : '', { status })),
      );
    }

    function posted(fetchFn: typeof fetch): Posted {
      const init = vi.mocked(fetchFn).mock.calls[0]?.[1];
      return JSON.parse(init?.body as string) as Posted;
    }

    function codeBlock(body: Posted): string | undefined {
      return body.fields.description.content.find((node) => node.type === 'codeBlock')?.content?.[0]?.text;
    }

    async function useConfigDir(log: string | null): Promise<void> {
      const dir = await mkdtemp(join(tmpdir(), 'maple-report-'));
      vi.stubEnv('MAPLE_CONFIG_DIR', dir);
      if (log !== null) {
        await mkdir(join(dir, 'logs'));
        await writeFile(join(dir, 'logs', 'main.log'), log);
      }
    }

    const lines = Array.from({ length: 300 }, (_, i) =>
      i === 249 ? `line 250 token=${TOKEN}` : `line ${String(i + 1)}`,
    );

    test.each([
      { kind: 'bug', parent: { key: 'MPL-70' }, labels: [], first: 'line 101', last: 'line 300' },
      { kind: 'feature', parent: undefined, labels: ['needs-refinement'], first: undefined, last: undefined },
    ])('files a $kind in MPL', async ({ kind, parent, labels, first, last }) => {
      // given
      await useConfigDir(`${lines.join('\n')}\n`);
      const fetchFn = createFetch();
      registerJira(withJira(fetchFn), logger);
      // when
      const got = await handler('jira:report')({} as IpcMainInvokeEvent, { kind, title: 'Crash', description: 'x' });
      // then
      expect(got).toEqual({ key: 'MPL-80', url: 'https://example.atlassian.net/browse/MPL-80' });
      const body = posted(fetchFn);
      expect(body.fields.project.key).toBe('MPL');
      expect(body.fields.parent).toEqual(parent);
      expect(body.fields.labels).toEqual(labels);
      const log = codeBlock(body)?.split('\n');
      expect(log?.length).toBe(first === undefined ? undefined : 200);
      expect(log?.at(0)).toBe(first);
      expect(log?.at(-1)).toBe(last);
      expect(JSON.stringify(body)).not.toContain(TOKEN);
      expect(logger.info).toHaveBeenCalledWith('jira', 'filed', { key: 'MPL-80', kind });
    });

    test('files a bug without a log file', async () => {
      // given
      await useConfigDir(null);
      const fetchFn = createFetch();
      registerJira(withJira(fetchFn), logger);
      // when
      await handler('jira:report')({} as IpcMainInvokeEvent, { kind: 'bug', title: 'Crash', description: '' });
      // then
      expect(codeBlock(posted(fetchFn))).toBe('(no log found)');
    });

    test.each([
      { name: 'an empty title', title: '', description: '' },
      { name: 'a title over 255 characters', title: 'x'.repeat(256), description: '' },
      { name: 'a description over 10,000 characters', title: 'Crash', description: 'x'.repeat(10_001) },
    ])('refuses $name before any request', async ({ title, description }) => {
      // given
      const fetchFn = createFetch();
      registerJira(withJira(fetchFn), logger);
      // when
      const got = (async () => handler('jira:report')({} as IpcMainInvokeEvent, { kind: 'bug', title, description }))();
      // then
      await expect(got).rejects.toThrow('arguments are invalid');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    test('logs a failed report at warn', async () => {
      // given
      await useConfigDir(null);
      registerJira(withJira(createFetch(500)), logger);
      // when
      const got = handler('jira:report')({} as IpcMainInvokeEvent, { kind: 'bug', title: 'Crash', description: '' });
      // then
      await expect(got).rejects.toThrow('filing report:');
      expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
        operation: 'jira:report',
        kind: 'bug',
        error: expect.stringContaining('filing report:') as unknown,
      });
    });

    test('rejects with filing report when Jira fails', async () => {
      // given
      await useConfigDir(null);
      registerJira(withJira(createFetch(400)), logger);
      // when
      const got = handler('jira:report')({} as IpcMainInvokeEvent, { kind: 'bug', title: 'Crash', description: '' });
      // then
      await expect(got).rejects.toThrow(/^filing report: creating issue: Jira returned 400$/);
    });
  });

  test('logs nothing when the sprint loads', async () => {
    // given
    registerJira(withJira(jiraFetch(() => 200)), logger);
    // when
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
