import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { aboutDetail, readBuildInfo } from './buildInfo';

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'maple-build-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('readBuildInfo', () => {
  test('reads the commit and build date from build.json', async () => {
    // given
    const dir = await tempDir();
    await writeFile(join(dir, 'build.json'), '{"sha":"abc1234","date":"2026-11-11T10:00:00.000Z"}');
    // when
    const got = await readBuildInfo(dir);
    // then
    expect(got).toEqual({ sha: 'abc1234', date: '2026-11-11T10:00:00.000Z' });
  });

  test.each([
    { name: 'a missing file', content: null },
    { name: 'invalid JSON', content: '{not json' },
  ])('returns unknown when build.json is missing or unreadable: $name', async ({ content }) => {
    // given
    const dir = await tempDir();
    if (content !== null) {
      await writeFile(join(dir, 'build.json'), content);
    }
    // when
    const got = await readBuildInfo(dir);
    // then
    expect(got).toEqual({ sha: 'unknown', date: 'unknown' });
  });
});

describe('aboutDetail', () => {
  test('names the version, commit, and build date', () => {
    // when
    const got = aboutDetail('0.1.0', { sha: 'abc1234', date: '2026-11-11T10:00:00.000Z' });
    // then
    expect(got).toBe('Version 0.1.0\nCommit abc1234\nBuilt 2026-11-11T10:00:00.000Z');
  });
});
