import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { saveFindings } from './saveFindings';

const file: FindingsFile = {
  version: 1,
  card: 'MPL-1',
  round: 1,
  headSha: 'a'.repeat(40),
  updatedAt: '2026-11-12T12:00:00.000Z',
  resume: null,
  findings: [],
};

describe('saveFindings', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-save-findings-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('replaces the file without leaving a temp file', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), '{"old":true}');
    // when
    await saveFindings(dir, file);
    // then
    expect(JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8'))).toEqual(file);
    expect(await readdir(dir)).toEqual(['MPL-1.json']);
  });

  test('refuses a temp file that is a symlink', async () => {
    // given
    const target = join(dir, 'target.txt');
    await writeFile(target, 'keep');
    await symlink(target, join(dir, 'MPL-1.json.maple.tmp'));
    // when
    const run = saveFindings(dir, file);
    // then
    await expect(run).rejects.toThrow('saving findings: MPL-1.json');
    expect(await readFile(target, 'utf8')).toBe('keep');
  });

  test('a failed save leaves the old file and names it in the error', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), '{"old":true}');
    await mkdir(join(dir, 'MPL-1.json.maple.tmp'));
    // when
    const run = saveFindings(dir, file);
    // then
    await expect(run).rejects.toThrow(/^saving findings: MPL-1\.json: /);
    expect(await readFile(join(dir, 'MPL-1.json'), 'utf8')).toBe('{"old":true}');
  });

  test('keeps fields and chips from the base that the file does not list', async () => {
    // given
    const base = { ...file, extra: 1, findings: [{ id: 'F1', chips: ['future-chip'], note: 'kept' }] };
    const finding = {
      id: 'F1',
      identity: { kind: 'code' as const, class: 'xss', file: 'a.ts', hash: '0' },
      line: null,
      severity: 'high' as const,
      sources: [],
      title: 't',
      what: '',
      how: '',
      impact: '',
      defense: '',
      chips: [],
      applied: null,
      decision: null,
      severityOverride: 'low' as const,
    };
    // when
    await saveFindings(dir, { ...file, findings: [finding] }, base);
    // then
    expect(JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8'))).toEqual({
      ...file,
      extra: 1,
      findings: [{ ...finding, chips: ['future-chip'], note: 'kept' }],
    });
  });

  test('refuses a bad card key', async () => {
    // given
    const bad = { ...file, card: '../MPL-1' };
    // when
    const run = saveFindings(dir, bad);
    // then
    await expect(run).rejects.toThrow('saving findings: bad card key ../MPL-1');
  });
});
