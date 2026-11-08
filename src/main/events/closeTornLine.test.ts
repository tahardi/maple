import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { closeTornLine } from './closeTornLine';

describe('closeTornLine', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-torn-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test.each([
    { name: 'ends a torn line with a newline', before: 'a\n{"v"', want: 'a\n{"v"\n' },
    { name: 'leaves a finished file alone', before: 'a\n', want: 'a\n' },
    { name: 'leaves an empty file alone', before: '', want: '' },
  ])('$name', async ({ before, want }) => {
    // given
    const path = join(dir, 'day.jsonl');
    await writeFile(path, before);

    // when
    await closeTornLine(path);

    // then
    expect(await readFile(path, 'utf8')).toBe(want);
  });

  test('does not create a missing file', async () => {
    // given
    const path = join(dir, 'day.jsonl');

    // when
    await closeTornLine(path);

    // then
    expect(await readdir(dir)).toEqual([]);
  });
});
