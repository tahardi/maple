import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { JiraClient, readCreds } from './jira';

const fixtures = resolve(import.meta.dirname, '../../test/fixtures/jira');
const creds = { site: 'https://example.atlassian.net', email: 'me@example.com', token: 'secret' };

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

function fakeFetch(routes: Record<string, string>): typeof fetch {
  return vi.fn<typeof fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = new Map(Object.entries(routes)).get(url.pathname);
    if (body === undefined) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return Promise.resolve(new Response(body, { status: 200 }));
  });
}

const activeRoutes = {
  '/rest/agile/1.0/board/7/sprint': fixture('board-sprint-active.json'),
  '/rest/api/3/search/jql': fixture('sprint-issues.json'),
};

describe('JiraClient', () => {
  test('activeSprint returns the sprint and its cards', async () => {
    // given
    const client = new JiraClient(creds, fakeFetch(activeRoutes));
    // when
    const got = await client.activeSprint(7);
    // then
    expect(got?.id).toBe(6);
    expect(got?.name).toBe('HALO Sprint 1');
    expect(got?.startDate).toBe('2026-10-12T13:00:00.000Z');
    expect(got?.endDate).toBe('2026-10-26T21:00:00.000Z');
    expect(
      got?.cards.map(({ key, status, points, labels, blockedBy, url }) => ({
        key,
        status,
        points,
        labels,
        blockedBy,
        url,
      })),
    ).toEqual([
      { key: 'HALO-11', status: 'Done', points: 3, labels: [], blockedBy: [], url: `${creds.site}/browse/HALO-11` },
      {
        key: 'HALO-19',
        status: 'To Do',
        points: 5,
        labels: ['parallelizable'],
        blockedBy: [
          { key: 'HALO-12', status: 'Done' },
          { key: 'HALO-18', status: 'In Review' },
        ],
        url: `${creds.site}/browse/HALO-19`,
      },
      {
        key: 'HALO-13',
        status: 'To Do',
        points: null,
        labels: ['needs-taylor', 'parallelizable'],
        blockedBy: [],
        url: `${creds.site}/browse/HALO-13`,
      },
    ]);
    expect(got?.cards[0]?.summary).toBe('Repo Bootstrap');
    expect(got?.cards[0]?.descriptionMd).toContain('**Plan:** Obsidian vault `Projects/Halo/Implementation Plan.md`');
  });

  test('activeSprint follows nextPageToken until the last page', async () => {
    // given
    const all = JSON.parse(fixture('sprint-issues.json')) as { issues: unknown[] };
    const pages = [
      { issues: all.issues.slice(0, 2), nextPageToken: 'page2' },
      { issues: all.issues.slice(2), isLast: true },
    ];
    const fetchFn = vi.fn<typeof fetch>((input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const body = url.pathname.endsWith('/sprint')
        ? fixture('board-sprint-active.json')
        : JSON.stringify(url.searchParams.get('nextPageToken') === 'page2' ? pages[1] : pages[0]);
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const client = new JiraClient(creds, fetchFn);
    // when
    const got = await client.activeSprint(7);
    // then
    expect(got?.cards.map((c) => c.key)).toEqual(['HALO-11', 'HALO-19', 'HALO-13']);
  });

  test('activeSprint returns null when no sprint is active', async () => {
    // given
    const client = new JiraClient(creds, fakeFetch({ '/rest/agile/1.0/board/7/sprint': fixture('sprint-none.json') }));
    // when
    const got = await client.activeSprint(7);
    // then
    expect(got).toBeNull();
  });

  test('backlog groups unfinished cards outside open sprints by epic', async () => {
    // given
    const client = new JiraClient(creds, fakeFetch({ '/rest/api/3/search/jql': fixture('backlog-issues.json') }));
    // when
    const got = await client.backlog('HALO');
    // then
    expect(got.map((g) => ({ epic: g.epic, cards: g.cards.map((c) => c.key) }))).toEqual([
      { epic: { key: 'HALO-2', summary: 'Search' }, cards: ['HALO-11', 'HALO-13'] },
      { epic: null, cards: ['HALO-19'] },
    ]);
  });

  test('backlog asks for cards outside open sprints that are not done or epics', async () => {
    // given
    const fetchFn = fakeFetch({ '/rest/api/3/search/jql': fixture('backlog-issues.json') });
    const client = new JiraClient(creds, fetchFn);
    // when
    await client.backlog('HALO');
    // then
    const input = vi.mocked(fetchFn).mock.calls[0]?.[0] ?? '';
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.searchParams.get('jql')).toBe(
      'project = HALO AND (sprint is EMPTY OR sprint not in openSprints()) AND statusCategory != Done ' +
        'AND issuetype != Epic ORDER BY Rank',
    );
    expect(url.searchParams.get('fields')?.split(',')).toContain('parent');
  });

  test('getCard returns the card with its blockers', async () => {
    // given
    const client = new JiraClient(creds, fakeFetch({ '/rest/api/3/issue/HALO-19': fixture('issue.json') }));
    // when
    const got = await client.getCard('HALO-19');
    // then
    expect(got.key).toBe('HALO-19');
    expect(got.summary).toBe('Summary Extractor');
    expect(got.blockedBy.map((b) => b.key)).toEqual(['HALO-12', 'HALO-18']);
    expect(got.descriptionMd).toContain('**Plan:** Obsidian vault `Projects/Halo/Implementation Plan.md`');
  });

  test('moveToSprint posts the keys to the sprint', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
    const client = new JiraClient(creds, fetchFn);
    // when
    await client.moveToSprint(6, ['HALO-20', 'HALO-21']);
    // then
    const [input, init] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(input).toBe(`${creds.site}/rest/agile/1.0/sprint/6/issue`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"issues":["HALO-20","HALO-21"]}');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe(`Basic ${Buffer.from('me@example.com:secret').toString('base64')}`);
  });

  test('moveToSprint rejects when Jira returns 400', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 400 })));
    const client = new JiraClient(creds, fetchFn);
    // when
    const got = client.moveToSprint(6, ['HALO-20']);
    // then
    await expect(got).rejects.toThrow('moving cards to sprint: Jira returned 400');
  });

  test('sends basic auth from email and token', async () => {
    // given
    const fetchFn = fakeFetch(activeRoutes);
    const client = new JiraClient(creds, fetchFn);
    // when
    await client.activeSprint(7);
    // then
    const init = vi.mocked(fetchFn).mock.calls[0]?.[1];
    const want = `Basic ${Buffer.from('me@example.com:secret').toString('base64')}`;
    expect(new Headers(init?.headers).get('Authorization')).toBe(want);
  });

  test('rejects when Jira returns 401', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 401 })));
    const client = new JiraClient(creds, fetchFn);
    // when
    const got = client.activeSprint(7);
    // then
    await expect(got).rejects.toThrow('fetching sprint: Jira returned 401');
  });

  test('rejects with the cause on a network error', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('getaddrinfo ENOTFOUND')));
    const client = new JiraClient(creds, fetchFn);
    // when
    const got = client.activeSprint(7);
    // then
    await expect(got).rejects.toThrow('fetching sprint: getaddrinfo ENOTFOUND');
  });

  test.each([
    {
      name: 'getCard gets a 401',
      call: (c: JiraClient) => c.getCard('HALO-19'),
      body: '',
      status: 401,
      want: 'fetching card: Jira returned 401',
    },
    {
      name: 'the sprint response has an unexpected shape',
      call: (c: JiraClient) => c.activeSprint(7),
      body: '{"sprints":[]}',
      status: 200,
      want: 'fetching sprint: ',
    },
    {
      name: 'a card has a status outside the four Maple knows',
      call: (c: JiraClient) => c.getCard('HALO-19'),
      body: fixture('issue.json').replaceAll('"name": "To Do"', '"name": "Backlog"'),
      status: 200,
      want: 'fetching card: ',
    },
  ])('rejects when $name', async ({ call, body, status, want }) => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status })));
    const client = new JiraClient(creds, fetchFn);
    // when
    const got = call(client);
    // then
    await expect(got).rejects.toThrow(want);
  });

  test.each([
    {
      name: 'field errors',
      body: '{"errorMessages":[],"errors":{"description":"The entered text is too long."}}',
      want: 'creating issue: Jira returned 400: description: The entered text is too long.',
    },
    {
      name: 'error messages',
      body: '{"errorMessages":["Issue type is required."],"errors":{}}',
      want: 'creating issue: Jira returned 400: Issue type is required.',
    },
    { name: 'a body that is not JSON', body: '<html>', want: 'creating issue: Jira returned 400' },
  ])('createIssue includes Jira $name in the error', async ({ body, want }) => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status: 400 })));
    const client = new JiraClient(creds, fetchFn);
    const doc = { version: 1, type: 'doc', content: [] };
    // when
    const got = client.createIssue({ projectKey: 'MPL', summary: 'x', description: doc, parentKey: null, labels: [] });
    // then
    await expect(got).rejects.toThrow(new Error(want));
  });

  test.each([
    { name: 'with a parent', parentKey: 'MPL-70', labels: [], parent: { key: 'MPL-70' } },
    { name: 'without a parent', parentKey: null, labels: ['needs-refinement'], parent: undefined },
  ])('createIssue posts the issue and returns its key and url $name', async ({ parentKey, labels, parent }) => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(fixture('create-issue.json'))));
    const client = new JiraClient(creds, fetchFn);
    const doc = { version: 1, type: 'doc', content: [] };
    // when
    const got = await client.createIssue({
      projectKey: 'MPL',
      summary: 'Crash on start',
      description: doc,
      parentKey,
      labels,
    });
    // then
    expect(got).toEqual({ key: 'MPL-80', url: 'https://example.atlassian.net/browse/MPL-80' });
    const [input, init] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    expect(input).toBe('https://example.atlassian.net/rest/api/3/issue');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe(`Basic ${Buffer.from('me@example.com:secret').toString('base64')}`);
    const body = JSON.parse(init?.body as string) as { fields: Record<string, unknown> };
    expect(body.fields).toEqual({
      project: { key: 'MPL' },
      summary: 'Crash on start',
      issuetype: { name: 'Task' },
      description: doc,
      labels,
      parent,
    });
    expect(Object.hasOwn(body.fields, 'parent')).toBe(parent !== undefined);
  });

  test('createIssue rejects when Jira returns 400', async () => {
    // given
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 400 })));
    const client = new JiraClient(creds, fetchFn);
    // when
    const got = client.createIssue({ projectKey: 'MPL', summary: 's', description: {}, parentKey: null, labels: [] });
    // then
    await expect(got).rejects.toThrow('creating issue: Jira returned 400');
  });
});

describe('readCreds', () => {
  test.each([
    {
      name: 'adds https when the site has no scheme',
      env: 'JIRA_SITE=example.atlassian.net\nJIRA_EMAIL=me@example.com\nJIRA_TOKEN=secret\n',
    },
    {
      name: 'keeps an existing scheme',
      env: 'JIRA_SITE=https://example.atlassian.net\nJIRA_EMAIL=me@example.com\nJIRA_TOKEN=secret\n',
    },
    {
      name: 'strips quotes, export prefixes, and a trailing slash',
      env: 'export JIRA_SITE="example.atlassian.net/"\nexport JIRA_EMAIL=\'me@example.com\'\nJIRA_TOKEN = secret\n',
    },
  ])('$name', async ({ env }) => {
    // given
    const dir = await mkdtemp(join(tmpdir(), 'maple-jira-'));
    const path = join(dir, 'env');
    await writeFile(path, env);
    // when
    const got = await readCreds(path);
    // then
    expect(got).toEqual(creds);
  });

  test.each([
    {
      name: 'a key is missing',
      env: 'JIRA_SITE=example.atlassian.net\nJIRA_EMAIL=me@example.com\n',
      want: 'reading jira creds: JIRA_TOKEN is missing',
    },
    { name: 'the file does not exist', env: null, want: 'reading jira creds: ENOENT' },
  ])('rejects when $name', async ({ env, want }) => {
    // given
    const dir = await mkdtemp(join(tmpdir(), 'maple-jira-'));
    const path = join(dir, 'env');
    if (env !== null) {
      await writeFile(path, env);
    }
    // when
    const got = readCreds(path);
    // then
    await expect(got).rejects.toThrow(want);
  });
});
