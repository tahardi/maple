import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { KEEP_DAYS, MAX_BYTES, pruneEvents, pruneLimits } from './pruneEvents';

const now = new Date('2026-11-07T12:00:00.000Z');

describe('pruneEvents', () => {
  let dir: string;

  async function seed(names: readonly string[], bytes: number): Promise<void> {
    await Promise.all(names.map((name) => writeFile(join(dir, name), 'x'.repeat(bytes))));
  }

  async function remaining(): Promise<string[]> {
    return (await readdir(dir)).sort();
  }

  beforeEach(async () => {
    vi.stubEnv('TZ', 'UTC');
    dir = await mkdtemp(join(tmpdir(), 'maple-prune-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  test('deletes day files older than the kept days', async () => {
    // given
    await seed(['2025-11-06.jsonl', '2025-11-07.jsonl', '2026-11-07.jsonl'], 1);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 1000 });

    // then
    expect(await remaining()).toEqual(['2025-11-07.jsonl', '2026-11-07.jsonl']);
  });

  test('deletes the oldest days until the folder is under the size budget', async () => {
    // given
    await seed(['2026-11-05.jsonl', '2026-11-06.jsonl', '2026-11-07.jsonl'], 10);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 });

    // then
    expect(await remaining()).toEqual(['2026-11-06.jsonl', '2026-11-07.jsonl']);
  });

  test('leaves files that are not day files alone', async () => {
    // given
    await seed(['notes.txt'], 100);
    await seed(['2020-01-01.jsonl'], 1);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 });

    // then
    expect(await remaining()).toEqual(['notes.txt']);
  });

  test('deletes the oldest day when the total equals the budget', async () => {
    // given
    await seed(['2026-11-06.jsonl', '2026-11-07.jsonl'], 10);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 20 });

    // then
    expect(await remaining()).toEqual(['2026-11-07.jsonl']);
  });

  test('does not count expired files toward the budget', async () => {
    // given
    await seed(['2020-01-01.jsonl'], 1000);
    await seed(['2026-11-07.jsonl'], 10);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 });

    // then
    expect(await remaining()).toEqual(['2026-11-07.jsonl']);
  });

  test.each([
    { name: 'deletes today when the answer is yes', answer: true, want: [] },
    { name: 'keeps today when the answer is no', answer: false, want: ['2026-11-07.jsonl'] },
  ])('$name', async ({ answer, want }) => {
    // given
    await seed(['2026-11-07.jsonl'], 100);
    const ask = vi.fn(() => Promise.resolve(answer));

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 }, ask);

    // then
    expect(ask).toHaveBeenCalledWith(100);
    expect(await remaining()).toEqual(want);
  });

  test('keeps today when nothing can be asked', async () => {
    // given
    await seed(['2026-11-07.jsonl'], 100);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 });

    // then
    expect(await remaining()).toEqual(['2026-11-07.jsonl']);
  });

  test('does not ask about today when deleting older days is enough', async () => {
    // given
    await seed(['2026-11-06.jsonl'], 100);
    await seed(['2026-11-07.jsonl'], 10);
    const ask = vi.fn(() => Promise.resolve(true));

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 }, ask);

    // then
    expect(ask).not.toHaveBeenCalled();
    expect(await remaining()).toEqual(['2026-11-07.jsonl']);
  });

  test('deletes a newest day that is not today without asking', async () => {
    // given
    await seed(['2026-11-06.jsonl'], 100);
    const ask = vi.fn(() => Promise.resolve(false));

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 }, ask);

    // then
    expect(ask).not.toHaveBeenCalled();
    expect(await remaining()).toEqual([]);
  });

  test('returns the names it deleted, oldest first', async () => {
    // given
    await seed(['2020-01-01.jsonl', '2026-11-05.jsonl', '2026-11-06.jsonl', '2026-11-07.jsonl'], 10);

    // when
    const deleted = await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 });

    // then
    expect(deleted).toEqual(['2020-01-01.jsonl', '2026-11-05.jsonl']);
  });

  test('leaves names that only look like day files alone', async () => {
    // given
    const names = ['2020-01-01.jsonl.bak', '2020-1-1.jsonl'];
    await seed(names, 100);

    // when
    await pruneEvents(dir, now, { keepDays: 365, maxBytes: 25 });

    // then
    expect(await remaining()).toEqual([...names].sort());
  });

  test('counts kept days in local time', async () => {
    // given
    vi.stubEnv('TZ', 'Asia/Tokyo');
    await seed(['2025-11-07.jsonl', '2025-11-08.jsonl'], 1);

    // when
    await pruneEvents(dir, new Date('2026-11-07T16:00:00.000Z'), { keepDays: 365, maxBytes: 1000 });

    // then
    expect(await remaining()).toEqual(['2025-11-08.jsonl']);
  });

  test('does nothing when the folder is missing', async () => {
    // given
    const missing = join(dir, 'missing');

    // when
    const pruning = pruneEvents(missing, now);

    // then
    await expect(pruning).resolves.toEqual([]);
  });

  test('uses 365 days and 200 MB by default', () => {
    // given
    const megabyte = 1024 * 1024;

    // when
    const limits = { KEEP_DAYS, MAX_BYTES };

    // then
    expect(limits).toEqual({ KEEP_DAYS: 365, MAX_BYTES: 200 * megabyte });
  });
});

describe('pruneLimits', () => {
  test.each([
    { name: 'the defaults without a config', config: null, want: { keepDays: KEEP_DAYS, maxBytes: MAX_BYTES } },
    {
      name: 'the config values, in bytes',
      config: { eventKeepDays: 30, eventMaxMegabytes: 2 },
      want: { keepDays: 30, maxBytes: 2 * 1024 * 1024 },
    },
  ])('uses $name', ({ config, want }) => {
    // when
    const limits = pruneLimits(config);

    // then
    expect(limits).toEqual(want);
  });
});
