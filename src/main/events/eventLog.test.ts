import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { setLogSecrets, type Logger } from '@main/app/log/log';
import { createEventLog } from './eventLog';
import { KEEP_DAYS } from './pruneEvents';

const schemas = {
  'test.ping': z.object({ n: z.number() }),
  'test.secret': z.object({ n: z.number(), authorization: z.string().optional() }),
  'test.text': z.object({ text: z.string() }),
};

const refs = { project: 'MPL', card: 'MPL-1', tab: 't-1', session: null };

const dirs: string[] = [];

function uuidAt(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'maple-events-'));
  dirs.push(dir);
  return dir;
}

async function setup() {
  const dir = await tempDir();
  vi.stubEnv('TZ', 'UTC');
  const clock = { now: new Date('2026-11-07T12:00:00.000Z') };
  let count = 0;
  const options = {
    schemas,
    now: () => clock.now,
    uuid: () => uuidAt(++count),
  };
  return { dir, clock, options, create: (logger?: Logger) => createEventLog({ ...options, dir, logger }) };
}

async function lines(path: string): Promise<string[]> {
  return (await readFile(path, 'utf8')).split('\n').filter((line) => line !== '');
}

afterEach(async () => {
  setLogSecrets([]);
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('createEventLog', () => {
  test('replaces a registered secret in a written record', async () => {
    // given
    const { dir, create } = await setup();
    const log = create();
    setLogSecrets(['tok-3f9a1c77e2']);
    // when
    await log.append('test.text', refs, { text: 'failed with tok-3f9a1c77e2' });
    // then
    const [line = ''] = await lines(join(dir, '2026-11-07.jsonl'));
    expect(line).not.toContain('tok-3f9a1c77e2');
    expect(JSON.parse(line)).toMatchObject({ data: { text: 'failed with [redacted]' } });
  });

  test('replaces a Bearer credential in a written record', async () => {
    // given
    const { dir, create } = await setup();
    const log = create();
    // when
    await log.append('test.text', refs, { text: 'sent Bearer abc.def-123' });
    // then
    const [line = ''] = await lines(join(dir, '2026-11-07.jsonl'));
    expect(JSON.parse(line)).toMatchObject({ data: { text: 'sent Bearer [redacted]' } });
  });

  test('appends one JSON line per record to the day file', async () => {
    // given
    const { dir, create } = await setup();
    const log = create();

    // when
    await log.append('test.ping', refs, { n: 1 });
    await log.append('test.ping', refs, { n: 2 });

    // then
    const record = { at: '2026-11-07T12:00:00.000Z', type: 'test.ping', ...refs };
    const line = (id: string, n: number) => JSON.stringify({ v: 1, id, ...record, data: { n } }) + '\n';
    expect(await readFile(join(dir, '2026-11-07.jsonl'), 'utf8')).toBe(line(uuidAt(1), 1) + line(uuidAt(2), 2));
  });

  test('writes under MAPLE_CONFIG_DIR/events by default', async () => {
    // given
    const { dir, options } = await setup();
    vi.stubEnv('MAPLE_CONFIG_DIR', dir);
    const log = createEventLog(options);

    // when
    await log.append('test.ping', refs, { n: 1 });

    // then
    expect(await lines(join(dir, 'events', '2026-11-07.jsonl'))).toHaveLength(1);
  });

  test('starts a new file when the day changes', async () => {
    // given
    const { dir, clock, create } = await setup();
    const log = create();
    await log.append('test.ping', refs, { n: 1 });

    // when
    clock.now = new Date('2026-11-08T00:00:01.000Z');
    await log.append('test.ping', refs, { n: 2 });

    // then
    expect(await lines(join(dir, '2026-11-07.jsonl'))).toHaveLength(1);
    expect(await lines(join(dir, '2026-11-08.jsonl'))).toHaveLength(1);
  });

  test('writes records in call order', async () => {
    // given
    const { dir, create } = await setup();
    const log = create();
    const want = Array.from({ length: 50 }, (_, n) => n);

    // when
    await Promise.all(want.map((n) => log.append('test.ping', refs, { n })));

    // then
    const written = await lines(join(dir, '2026-11-07.jsonl'));
    expect(written.map((line) => (JSON.parse(line) as { data: { n: number } }).data.n)).toEqual(want);
  });

  test.each([
    { name: 'an unknown field', type: 'test.ping' as const, data: { n: 1, extra: 'x' } },
    { name: 'a secret-named field', type: 'test.secret' as const, data: { n: 1, authorization: 'Bearer x' } },
  ])('strips $name from data', async ({ type, data }) => {
    // given
    const { dir, create } = await setup();
    const log = create();

    // when
    await log.append(type, refs, data);

    // then
    const [line] = await lines(join(dir, '2026-11-07.jsonl'));
    expect((JSON.parse(line) as { data: object }).data).toEqual({ n: 1 });
  });

  test('rejects data that fails its schema and keeps writing', async () => {
    // given
    const { dir, create } = await setup();
    const log = create();

    // when
    const failure = await log.append('test.ping', refs, { n: 'one' } as never).catch((err: unknown) => err);
    await log.append('test.ping', refs, { n: 2 });

    // then
    expect(failure).toEqual(new Error('recording event test.ping: data does not match its schema'));
    const written = await lines(join(dir, '2026-11-07.jsonl'));
    expect(written.map((line) => JSON.parse(line) as object)).toEqual([expect.objectContaining({ data: { n: 2 } })]);
  });

  test('rejects only the write that fails', async () => {
    // given
    const { dir, clock, create } = await setup();
    await mkdir(join(dir, '2026-11-07.jsonl'));
    const log = create();

    // when
    const failure = await log.append('test.ping', refs, { n: 1 }).catch((err: unknown) => err);
    clock.now = new Date('2026-11-08T00:00:01.000Z');
    await log.append('test.ping', refs, { n: 2 });

    // then
    expect(failure).toBeInstanceOf(Error);
    expect(await lines(join(dir, '2026-11-08.jsonl'))).toHaveLength(1);
  });

  test('logs a pruning failure and keeps writing', async () => {
    // given
    const { dir, create } = await setup();
    await symlink(join(dir, 'gone'), join(dir, '2026-11-06.jsonl'));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = create(logger);

    // when
    await log.append('test.ping', refs, { n: 1 });

    // then
    expect(logger.warn).toHaveBeenCalledWith('events', 'failed', expect.objectContaining({ operation: 'pruneEvents' }));
    expect(await lines(join(dir, '2026-11-07.jsonl'))).toHaveLength(1);
  });

  test('rejects appends when the folder cannot be created', async () => {
    // given
    const { dir, options } = await setup();
    await writeFile(join(dir, 'blocked'), '');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = createEventLog({ ...options, dir: join(dir, 'blocked', 'events'), logger });

    // when
    const appending = log.append('test.ping', refs, { n: 1 });

    // then
    await expect(appending).rejects.toThrow('ENOTDIR');
    expect(logger.warn).toHaveBeenCalledWith(
      'events',
      'failed',
      expect.objectContaining({ operation: 'createEventsDir' }),
    );
  });

  test('logs the day files it pruned', async () => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2025-01-01.jsonl'), 'old\n');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = create(logger);

    // when
    await log.append('test.ping', refs, { n: 1 });

    // then
    expect(logger.info).toHaveBeenCalledWith('events', 'pruned', { deleted: ['2025-01-01.jsonl'] });
  });

  test('logs nothing when no day file was pruned', async () => {
    // given
    const { create } = await setup();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const log = create(logger);

    // when
    await log.append('test.ping', refs, { n: 1 });

    // then
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('prunes with the limits and the question it is given', async () => {
    // given
    const { dir, options } = await setup();
    await writeFile(join(dir, '2026-11-01.jsonl'), 'old\n');
    await writeFile(join(dir, '2026-11-07.jsonl'), 'today\n');
    const askDeleteToday = vi.fn(() => Promise.resolve(false));
    const limits = { keepDays: 1, maxBytes: 1 };
    const log = createEventLog({ ...options, dir, limits, askDeleteToday });

    // when
    await log.readEvents({ from: '2026-11-07T00:00:00.000Z', to: '2026-11-07T23:59:59.999Z' });

    // then
    expect(askDeleteToday).toHaveBeenCalledWith(6);
    expect(await readdir(dir)).toEqual(['2026-11-07.jsonl']);
  });

  test('prunes old day files before the first write', async () => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2025-01-01.jsonl'), 'old\n');
    const log = create();

    // when
    await log.append('test.ping', refs, { n: 1 });

    // then
    expect(await readdir(dir)).toEqual(['2026-11-07.jsonl']);
  });
});

describe('eventLog', () => {
  const range = { from: '2026-11-07T00:00:00.000Z', to: '2026-11-07T23:59:59.999Z' };

  async function freshModule() {
    vi.stubEnv('MAPLE_CONFIG_DIR', await tempDir());
    vi.resetModules();
    return import('./eventLog');
  }

  test('throws before the log is started', async () => {
    // given
    const { eventLog } = await freshModule();

    // when
    const read = () => eventLog();

    // then
    expect(read).toThrow('reading event log: the event log is not started');
  });

  test('returns the log that startEventLog created', async () => {
    // given
    const { eventLog, startEventLog } = await freshModule();

    // when
    const started = startEventLog();
    await started.readEvents(range);

    // then
    expect(eventLog()).toBe(started);
  });

  test.each([
    { name: 'the default before the log is started', limits: null, want: KEEP_DAYS },
    { name: 'the limit the log started with', limits: { keepDays: 30, maxBytes: 1 }, want: 30 },
  ])('eventKeepDays returns $name', async ({ limits, want }) => {
    // given
    const { eventKeepDays, startEventLog } = await freshModule();
    // when
    if (limits) {
      await startEventLog({ limits }).readEvents(range);
    }
    // then
    expect(eventKeepDays()).toBe(want);
  });

  test('creates the log only once', async () => {
    // given
    const { startEventLog } = await freshModule();

    // when
    const first = startEventLog();
    const second = startEventLog();
    await first.readEvents(range);

    // then
    expect(second).toBe(first);
  });
});

describe('readEvents', () => {
  const a = uuidAt(1);
  const b = uuidAt(2);
  const c = uuidAt(3);
  const dayRange = { from: '2026-11-07T00:00:00.000Z', to: '2026-11-07T23:59:59.999Z' };
  const allDays = { from: '2026-11-06T00:00:00.000Z', to: '2026-11-07T23:59:59.999Z' };

  function recordLine(overrides: object): string {
    return JSON.stringify({
      v: 1,
      id: uuidAt(9),
      at: '2026-11-07T12:00:00.000Z',
      type: 'test.ping',
      ...refs,
      data: { n: 1 },
      ...overrides,
    });
  }

  async function seeded() {
    const context = await setup();
    const log = context.create();
    context.clock.now = new Date('2026-11-06T12:00:00.000Z');
    await log.append('test.ping', { ...refs, card: 'MPL-1', session: 's-1' }, { n: 1 });
    context.clock.now = new Date('2026-11-07T12:00:00.000Z');
    await log.append('test.ping', { ...refs, card: 'MPL-2', session: 's-2' }, { n: 2 });
    context.clock.now = new Date('2026-11-07T13:00:00.000Z');
    await log.append('test.secret', { ...refs, card: 'MPL-1', session: 's-2' }, { n: 3 });
    return log;
  }

  test.each([
    {
      name: 'time range',
      filter: { from: '2026-11-07T00:00:00.000Z', to: '2026-11-07T12:30:00.000Z' },
      want: [b],
    },
    {
      name: 'a range whose ends match records exactly',
      filter: { from: '2026-11-07T12:00:00.000Z', to: '2026-11-07T13:00:00.000Z' },
      want: [b, c],
    },
    { name: 'range across days', filter: allDays, want: [a, b, c] },
    { name: 'card', filter: { ...allDays, card: 'MPL-1' }, want: [a, c] },
    { name: 'session', filter: { ...allDays, session: 's-2' }, want: [b, c] },
    { name: 'types', filter: { ...allDays, types: ['test.secret'] }, want: [c] },
  ])('filters by $name', async ({ filter, want }) => {
    // given
    const log = await seeded();

    // when
    const records = await log.readEvents(filter);

    // then
    expect(records.map((record) => record.id)).toEqual(want);
  });

  test('opens only the day files in the range', async () => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2026-11-01.jsonl'), recordLine({}) + '\n');
    const log = create();

    // when
    const records = await log.readEvents(dayRange);

    // then
    expect(records).toEqual([]);
  });

  test('skips a torn last line', async () => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2026-11-07.jsonl'), recordLine({}) + '\n{"v":1,"id":"');
    const log = create();

    // when
    const records = await log.readEvents(dayRange);

    // then
    expect(records.map((record) => record.id)).toEqual([uuidAt(9)]);
  });

  test('reads records appended after a torn last line', async () => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2026-11-07.jsonl'), recordLine({}) + '\n{"v":1,"id":"');
    const log = create();

    // when
    await log.append('test.ping', refs, { n: 2 });
    const records = await log.readEvents(dayRange);

    // then
    expect(records.map((record) => record.id)).toEqual([uuidAt(9), uuidAt(1)]);
  });

  test.each([
    { name: 'invalid JSON', bad: 'not json' },
    { name: 'a bad id', bad: recordLine({ id: 'nope' }) },
    { name: 'a missing field', bad: JSON.stringify({ v: 1, id: uuidAt(8) }) },
  ])('skips $name in the middle of a file', async ({ bad }) => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2026-11-07.jsonl'), `${bad}\n${recordLine({})}\n`);
    const log = create();

    // when
    const records = await log.readEvents(dayRange);

    // then
    expect(records.map((record) => record.id)).toEqual([uuidAt(9)]);
  });

  test('finds a record by local day when the zone is behind UTC', async () => {
    // given
    const { dir, clock, create } = await setup();
    vi.stubEnv('TZ', 'America/Los_Angeles');
    clock.now = new Date('2026-11-08T03:00:00.000Z');
    const log = create();
    await log.append('test.ping', refs, { n: 1 });

    // when
    const records = await log.readEvents({ from: '2026-11-08T00:00:00.000Z', to: '2026-11-08T23:59:59.999Z' });

    // then
    expect(await readdir(dir)).toEqual(['2026-11-07.jsonl']);
    expect(records.map((record) => record.id)).toEqual([uuidAt(1)]);
  });

  test.each([
    { name: 'an empty types list', filter: { ...allDays, types: [] } },
    { name: 'a range that ends before it starts', filter: { from: allDays.to, to: allDays.from } },
    { name: 'invalid dates', filter: { from: 'nope', to: 'nope' } },
  ])('returns nothing for $name', async ({ filter }) => {
    // given
    const log = await seeded();

    // when
    const records = await log.readEvents(filter);

    // then
    expect(records).toEqual([]);
  });

  test('skips records with an unknown version', async () => {
    // given
    const { dir, create } = await setup();
    await writeFile(join(dir, '2026-11-07.jsonl'), recordLine({ v: 2 }) + '\n');
    const log = create();

    // when
    const records = await log.readEvents(dayRange);

    // then
    expect(records).toEqual([]);
  });

  test('returns nothing when the events folder is missing', async () => {
    // given
    const { dir, create } = await setup();
    const log = create();
    await log.readEvents(dayRange);
    await rm(dir, { recursive: true, force: true });

    // when
    const records = await log.readEvents(dayRange);

    // then
    expect(records).toEqual([]);
  });

  test('includes writes that are still queued', async () => {
    // given
    const { create } = await setup();
    const log = create();

    // when
    const appending = log.append('test.ping', refs, { n: 1 });
    const records = await log.readEvents(dayRange);
    await appending;

    // then
    expect(records.map((record) => record.data)).toEqual([{ n: 1 }]);
  });
});
