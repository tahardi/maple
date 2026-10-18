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
  '/rest/agile/1.0/sprint/6/issue': fixture('sprint-issues.json'),
};

describe('JiraClient', () => {
  test('activeSprint returns the sprint and its cards', async () => {
    // given
    const client = new JiraClient(creds, fakeFetch(activeRoutes));
    // when
    const got = await client.activeSprint(7);
    // then
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
    expect(got?.cards[0]?.descriptionMd).toContain('Plan:');
  });

  test('activeSprint returns null when no sprint is active', async () => {
    // given
    const client = new JiraClient(creds, fakeFetch({ '/rest/agile/1.0/board/7/sprint': fixture('sprint-none.json') }));
    // when
    const got = await client.activeSprint(7);
    // then
    expect(got).toBeNull();
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
});

describe('readCreds', () => {
  test.each([
    { name: 'adds https when the site has no scheme', site: 'example.atlassian.net' },
    { name: 'keeps an existing scheme', site: 'https://example.atlassian.net' },
  ])('$name', async ({ site }) => {
    // given
    const dir = await mkdtemp(join(tmpdir(), 'maple-jira-'));
    const path = join(dir, 'env');
    await writeFile(path, `JIRA_SITE=${site}\nJIRA_EMAIL=me@example.com\nJIRA_TOKEN=secret\n`);
    // when
    const got = await readCreds(path);
    // then
    expect(got).toEqual(creds);
  });

  test('rejects when a key is missing', async () => {
    // given
    const dir = await mkdtemp(join(tmpdir(), 'maple-jira-'));
    const path = join(dir, 'env');
    await writeFile(path, 'JIRA_SITE=example.atlassian.net\nJIRA_EMAIL=me@example.com\n');
    // when
    const got = readCreds(path);
    // then
    await expect(got).rejects.toThrow('reading jira creds: JIRA_TOKEN is missing');
  });
});
