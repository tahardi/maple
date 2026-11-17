import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readCreds } from './readCreds';

const creds = { site: 'https://example.atlassian.net', email: 'me@example.com', token: 'secret' };

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
