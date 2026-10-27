import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config';
import type { SessionManager } from '@main/sessions/sessions';
import type { StatusEngine } from '@main/sessions/status';
import type { Terminals } from '@main/sessions/terminals';
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
  setNotifications: () => Promise.resolve(),
  setZoom: () => Promise.resolve(),
  setLastProject: () => Promise.resolve(),
  lastProject: () => Promise.resolve(null),
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
      vi.fn<typeof fetch>((input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const name = url.pathname === '/rest/agile/1.0/board/7/epic' ? 'board-epics.json' : 'backlog-issues.json';
        return Promise.resolve(new Response(fixture(name)));
      }),
    );
    registerJira(deps, logger);
    // when
    const got = await handler('jira:backlog')({} as IpcMainInvokeEvent, 'HALO');
    // then
    expect(got).toMatchObject({ data: [{ epic: { key: 'HALO-2', color: 'purple' } }, { epic: null }], error: null });
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

  test('moveToSprint moves the cards with the startup creds', async () => {
    // given
    const path = await writeCreds();
    vi.stubEnv('MAPLE_JIRA_ENV', path);
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchFn);
    registerJira(deps, logger);
    await sprintHandler()({} as IpcMainInvokeEvent, 'HALO');
    await rm(path);
    // when
    await handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']);
    // then
    const [input, init] = fetchFn.mock.calls.at(-1) ?? [];
    expect(input).toBe('https://example.atlassian.net/rest/agile/1.0/sprint/6/issue');
    expect(init?.body).toBe('{"issues":["HALO-20"]}');
    expect(logger.warn).not.toHaveBeenCalledWith(
      'jira',
      'failed',
      expect.objectContaining({ operation: 'moveToSprint' }),
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
    registerJira(deps, logger);
    // when
    const got = Promise.resolve().then(() => handler('jira:moveToSprint')({} as IpcMainInvokeEvent, ...args));
    // then
    await expect(got).rejects.toThrow('handling jira:moveToSprint: arguments are invalid');
  });

  test('moveToSprint rejects with the creds error when creds are unreadable', async () => {
    // given
    registerJira(deps, logger);
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
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(fetchFn));
    registerJira(deps, logger);
    // when
    const got = await handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']).catch(
      (err: unknown) => err,
    );
    // then
    const message = got instanceof Error ? got.message : String(got);
    expect(message).toContain('moving cards to sprint:');
    expect(message).not.toContain(TOKEN);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
  });

  test('logs a failed move at warn', async () => {
    // given
    vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 400 }))),
    );
    registerJira(deps, logger);
    // when
    const got = handler('jira:moveToSprint')({} as IpcMainInvokeEvent, 6, ['HALO-20']);
    // then
    await expect(got).rejects.toThrow('moving cards to sprint: Jira returned 400');
    expect(logger.warn).toHaveBeenCalledWith('jira', 'failed', {
      operation: 'moveToSprint',
      error: 'moving cards to sprint: Jira returned 400',
    });
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
      vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
      await useConfigDir(`${lines.join('\n')}\n`);
      const fetchFn = createFetch();
      vi.stubGlobal('fetch', fetchFn);
      registerJira(deps, logger);
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
      vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
      await useConfigDir(null);
      const fetchFn = createFetch();
      vi.stubGlobal('fetch', fetchFn);
      registerJira(deps, logger);
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
      vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
      const fetchFn = createFetch();
      vi.stubGlobal('fetch', fetchFn);
      registerJira(deps, logger);
      // when
      const got = (async () => handler('jira:report')({} as IpcMainInvokeEvent, { kind: 'bug', title, description }))();
      // then
      await expect(got).rejects.toThrow('arguments are invalid');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    test('rejects with filing report when Jira fails', async () => {
      // given
      vi.stubEnv('MAPLE_JIRA_ENV', await writeCreds());
      await useConfigDir(null);
      vi.stubGlobal('fetch', createFetch(400));
      registerJira(deps, logger);
      // when
      const got = handler('jira:report')({} as IpcMainInvokeEvent, { kind: 'bug', title: 'Crash', description: '' });
      // then
      await expect(got).rejects.toThrow(/^filing report: creating issue: Jira returned 400$/);
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
