import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { StoredDecision } from './storedDecision';
import { readDecisions } from './readDecisions';
import { saveDecisions } from './saveDecisions';

const record: StoredDecision = {
  id: 'F1',
  identity: { kind: 'dependency', advisory: 'GHSA-1234-5678-9abc', package: 'lodash' },
  decision: { kind: 'fix-later', reason: null, decidedAt: '2026-11-13T12:00:00.000Z' },
  severityOverride: 'medium',
};

describe('decision store', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-decisions-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('reads nothing when no decisions were saved', async () => {
    // given
    // when
    const got = await readDecisions(join(dir, 'decisions'), 'MPL-1');
    // then
    expect(got).toEqual([]);
  });

  test('reads back what it saved, creating the folder', async () => {
    // given
    await saveDecisions(join(dir, 'decisions'), 'MPL-1', [record]);
    // when
    const got = await readDecisions(join(dir, 'decisions'), 'MPL-1');
    // then
    expect(got).toEqual([record]);
  });

  test('replaces the saved decisions', async () => {
    // given
    await saveDecisions(dir, 'MPL-1', [record]);
    // when
    await saveDecisions(dir, 'MPL-1', []);
    // then
    expect(JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8'))).toEqual([]);
  });

  test.each([
    { name: 'bad JSON', content: 'nope', want: /^reading decisions: MPL-1\.json: not valid JSON$/ },
    { name: 'a bad shape', content: JSON.stringify([{ id: 'F1' }]), want: /^reading decisions: MPL-1\.json: 0\./ },
  ])('throws on $name', async ({ content, want }) => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), content);
    // when
    const read = readDecisions(dir, 'MPL-1');
    // then
    await expect(read).rejects.toThrow(want);
  });

  test('never writes through a file planted at the temp name', async () => {
    // given
    await writeFile(join(dir, 'target.txt'), 'keep');
    await symlink(join(dir, 'target.txt'), join(dir, 'MPL-1.json.maple.tmp'));
    // when
    await saveDecisions(dir, 'MPL-1', [record]);
    // then
    expect(await readFile(join(dir, 'target.txt'), 'utf8')).toBe('keep');
  });

  test('a failed save names the file and leaves no temp file', async () => {
    // given
    await mkdir(join(dir, 'MPL-1.json'));
    // when
    const run = saveDecisions(dir, 'MPL-1', [record]);
    // then
    await expect(run).rejects.toThrow(/^saving decisions: MPL-1\.json: /);
    expect(await readdir(dir)).toEqual(['MPL-1.json']);
  });

  test.each(['../MPL-1', 'mpl-1'])('refuses the bad card key %s', async (key) => {
    // given
    // when
    const save = saveDecisions(dir, key, []);
    const read = readDecisions(dir, key);
    // then
    await expect(save).rejects.toThrow(`saving decisions: bad card key ${key}`);
    await expect(read).rejects.toThrow(`reading decisions: bad card key ${key}`);
  });
});
