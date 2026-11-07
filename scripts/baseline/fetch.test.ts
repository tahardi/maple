import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type Result, runScript, serveJira, token, writeEnv } from './scriptHarness';

type Card = { key: string; changelog: { histories: unknown[] } };

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('fetch.mjs', () => {
  let dir = '';
  let outDir = '';
  let envFile = '';
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-baseline-fetch-'));
    outDir = join(dir, 'out');
    envFile = join(dir, 'env');
  });

  afterEach(async () => {
    server?.close();
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  async function fetchWith(status: number, pageSize = 100, env: Record<string, string> = {}): Promise<Result> {
    server = await serveJira(status, pageSize);
    await writeEnv(envFile, server);
    return runScript('fetch.mjs', [outDir], { MAPLE_JIRA_ENV: envFile, ...env });
  }

  test('writes each Done card with its changelog', async () => {
    // when
    const result = await fetchWith(200);
    // then
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    for (const key of ['MPL-97', 'MPL-6']) {
      const card = (await readJson(join(outDir, 'jira', `${key}.json`))) as Card;
      expect(card.key).toBe(key);
      expect(card.changelog.histories.length).toBeGreaterThan(0);
    }
  });

  test('reads every page of Jira results', async () => {
    // when
    const result = await fetchWith(200, 1);
    // then
    expect(result.code).toBe(0);
    expect(existsSync(join(outDir, 'jira', 'MPL-97.json'))).toBe(true);
    expect(existsSync(join(outDir, 'jira', 'MPL-6.json'))).toBe(true);
  });

  test('matches a PR by its title when the branch has no card key', async () => {
    // given
    const prList = join(dir, 'prs.json');
    const pr = { number: 76, title: '[MPL-97] Inline New-Comment Form', headRefName: 'mpl-97-inline-comment-form' };
    await writeFile(
      prList,
      JSON.stringify([
        { ...pr, headRefName: 'inline-comments', createdAt: '2026-10-22T16:59:15Z', mergedAt: '2026-10-22T18:42:33Z' },
      ]),
    );
    // when
    await fetchWith(200, 100, { GH_PR_LIST: prList });
    // then
    const gh = (await readJson(join(outDir, 'gh', 'MPL-97.json'))) as { pr: { number: number } };
    expect(gh.pr.number).toBe(76);
  });

  test('exits 1 with "running gh ..." when gh fails, without printing the token', async () => {
    // when
    const result = await fetchWith(200, 100, { GH_PR_LIST: join(dir, 'missing.json') });
    // then
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^running gh pr list /);
    expect(result.stderr + result.stdout).not.toContain(token);
  });

  test('writes the merged PR timeline, reviews, comments, and runs for a matched card', async () => {
    // when
    await fetchWith(200);
    // then
    const gh = (await readJson(join(outDir, 'gh', 'MPL-97.json'))) as Record<string, unknown[]>;
    expect(gh).toMatchObject({ pr: { number: 76, headRefName: 'mpl-97-inline-comment-form' } });
    for (const field of ['timeline', 'reviews', 'comments', 'runs']) {
      expect(gh[field].length).toBeGreaterThan(0);
    }
  });

  test('writes no gh file for a card with no merged PR', async () => {
    // when
    await fetchWith(200);
    // then
    expect(existsSync(join(outDir, 'jira', 'MPL-6.json'))).toBe(true);
    expect(existsSync(join(outDir, 'gh', 'MPL-6.json'))).toBe(false);
  });

  test('writes meta.json with the reviewer login', async () => {
    // when
    await fetchWith(200);
    // then
    const meta = (await readJson(join(outDir, 'meta.json'))) as Record<string, string>;
    expect(Object.keys(meta).sort()).toEqual(['fetchedAt', 'reviewer']);
    expect(meta.reviewer).toBe('tahardi');
    expect(Number.isNaN(Date.parse(meta.fetchedAt))).toBe(false);
  });

  test('exits 1 with "fetching jira: 401" when Jira refuses', async () => {
    // when
    const result = await fetchWith(401);
    // then
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('fetching jira: 401');
    expect(result.stderr + result.stdout).not.toContain(token);
  });

  test('exits 1 with "reading jira creds: JIRA_TOKEN is missing" when the env file has no token', async () => {
    // given
    await writeFile(envFile, 'JIRA_SITE=http://127.0.0.1:1\nJIRA_EMAIL=me@example.com\n');
    // when
    const result = await runScript('fetch.mjs', [outDir], { MAPLE_JIRA_ENV: envFile });
    // then
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('reading jira creds: JIRA_TOKEN is missing');
  });
});
