import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { backupState } from './backupState';

describe('backupState', () => {
  let dir = '';
  let path = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-backup-'));
    path = join(dir, 'state.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('copies state.json to state.json.1', async () => {
    // given
    await writeFile(path, '"a"');
    // when
    await backupState(path);
    // then
    expect(await readFile(`${path}.1`, 'utf8')).toBe('"a"');
    expect(await readFile(path, 'utf8')).toBe('"a"');
  });

  test('keeps three backups with the newest in state.json.1', async () => {
    // given
    const contents = ['"a"', '"b"', '"c"', '"d"'];
    // when
    for (const content of contents) {
      await writeFile(path, content);
      await backupState(path);
    }
    // then
    expect(await readFile(`${path}.1`, 'utf8')).toBe('"d"');
    expect(await readFile(`${path}.2`, 'utf8')).toBe('"c"');
    expect(await readFile(`${path}.3`, 'utf8')).toBe('"b"');
    expect(await readdir(dir)).not.toContain('state.json.4');
  });

  test('moves later backups up when state.json.1 is missing', async () => {
    // given
    await writeFile(path, '"new"');
    await writeFile(`${path}.2`, '"old"');
    // when
    await backupState(path);
    // then
    expect(await readFile(`${path}.1`, 'utf8')).toBe('"new"');
    expect(await readFile(`${path}.3`, 'utf8')).toBe('"old"');
    expect(await readdir(dir)).not.toContain('state.json.2');
  });

  test('rejects when a backup cannot be moved', async () => {
    // given
    await writeFile(path, '"a"');
    await writeFile(`${path}.2`, '"two"');
    await mkdir(join(`${path}.3`, 'blocker'), { recursive: true });
    // when
    const backingUp = backupState(path);
    // then
    await expect(backingUp).rejects.toMatchObject({ code: 'EISDIR' });
  });

  test('rejects when state.json is missing', async () => {
    // given
    await rm(path, { force: true });
    // when
    const backingUp = backupState(path);
    // then
    await expect(backingUp).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('keeps only the given number of backups', async () => {
    // given
    const contents = ['"a"', '"b"', '"c"'];
    // when
    for (const content of contents) {
      await writeFile(path, content);
      await backupState(path, 2);
    }
    // then
    expect(await readFile(`${path}.1`, 'utf8')).toBe('"c"');
    expect(await readFile(`${path}.2`, 'utf8')).toBe('"b"');
    expect(await readdir(dir)).not.toContain('state.json.3');
  });

  test('skips the backup when state.json matches state.json.1', async () => {
    // given
    await writeFile(path, '"a"');
    await backupState(path);
    // when
    await backupState(path);
    // then
    expect(await readFile(`${path}.1`, 'utf8')).toBe('"a"');
    expect(await readdir(dir)).not.toContain('state.json.2');
  });
});
