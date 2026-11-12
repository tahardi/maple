import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_BYTES } from '@main/util/paths';
import { readSnapshot, removeSnapshots, snapshotDir } from './snapshots';

describe('snapshots', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-snapshots-'));
    vi.stubEnv('MAPLE_CONFIG_DIR', dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  test('snapshotDir is the session folder under the config dir', () => {
    // given
    const sessionId = 's1';
    // when
    const got = snapshotDir(sessionId);
    // then
    expect(got).toBe(join(dir, 'snapshots', 's1'));
  });

  test('readSnapshot returns the saved copy of a note', async () => {
    // given
    await mkdir(join(dir, 'snapshots', 's1', 'Projects'), { recursive: true });
    await writeFile(join(dir, 'snapshots', 's1', 'Projects', 'Spike.md'), '# Before\n');
    // when
    const got = await readSnapshot('s1', 'Projects/Spike.md');
    // then
    expect(got).toBe('# Before\n');
  });

  test('readSnapshot returns null when the session saved no copy of the note', async () => {
    // given
    const path = 'Spike.md';
    // when
    const got = await readSnapshot('s1', path);
    // then
    expect(got).toBeNull();
  });

  test.each([
    { name: 'a path that escapes', path: '../x.md' },
    { name: 'a path into another session', path: '../s2/x.md' },
    { name: 'an absolute path', path: '/etc/x.md' },
    { name: 'a non-Markdown path', path: 'a.png' },
  ])('readSnapshot rejects $name', async ({ path }) => {
    // given
    const sessionId = 's1';
    // when
    const got = readSnapshot(sessionId, path);
    // then
    await expect(got).rejects.toThrow('reading snapshot: path is outside the snapshots');
  });

  test('readSnapshot rejects a copy over the size limit', async () => {
    // given
    await mkdir(join(dir, 'snapshots', 's1'), { recursive: true });
    await writeFile(join(dir, 'snapshots', 's1', 'big.md'), 'x'.repeat(MAX_BYTES + 1));
    // when
    const got = readSnapshot('s1', 'big.md');
    // then
    await expect(got).rejects.toThrow('reading snapshot: note is too large to compare (over 2 MB)');
  });

  test('readSnapshot rejects when the copy cannot be read', async () => {
    // given
    await mkdir(join(dir, 'snapshots', 's1', 'x.md'), { recursive: true });
    // when
    const got = readSnapshot('s1', 'x.md');
    // then
    await expect(got).rejects.toThrow('EISDIR');
  });

  test('removeSnapshots keeps the folders of other sessions', async () => {
    // given
    await mkdir(join(dir, 'snapshots', 's1'), { recursive: true });
    await mkdir(join(dir, 'snapshots', 's2'), { recursive: true });
    // when
    await removeSnapshots('s1');
    // then
    expect((await stat(join(dir, 'snapshots', 's2'))).isDirectory()).toBe(true);
  });

  test('removeSnapshots deletes the session folder and ignores a missing one', async () => {
    // given
    await mkdir(join(dir, 'snapshots', 's1'), { recursive: true });
    // when
    await removeSnapshots('s1');
    await removeSnapshots('s1');
    // then
    await expect(stat(join(dir, 'snapshots', 's1'))).rejects.toThrow('ENOENT');
  });
});
