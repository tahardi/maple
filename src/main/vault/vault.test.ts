import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MAX_BYTES } from '@main/app/paths';
import { listNotes, readNote, writeNote } from './vault';

describe('vault', () => {
  let root = '';
  let vault = '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maple-vault-'));
    vault = join(root, 'vault');
    mkdirSync(join(vault, 'Projects', 'Maple'), { recursive: true });
    mkdirSync(join(vault, '.obsidian'));
    mkdirSync(join(vault, '.trash'));
    writeFileSync(join(vault, 'Inbox.md'), '# Inbox\n');
    writeFileSync(join(vault, 'Projects', 'Maple', 'Spike.md'), '## Findings\n');
    writeFileSync(join(vault, 'image.png'), 'png');
    writeFileSync(join(vault, '.obsidian', 'x.md'), 'hidden');
    writeFileSync(join(vault, '.trash', 'y.md'), 'trashed');
    writeFileSync(join(vault, 'big.md'), 'a'.repeat(MAX_BYTES + 1));
    writeFileSync(join(root, 'outside.md'), 'secret');
    utimesSync(join(vault, 'Inbox.md'), new Date('2026-10-19T12:00:00Z'), new Date('2026-10-19T12:00:00Z'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('listNotes returns nested Markdown notes sorted by path and skips dot folders', async () => {
    // given
    const dir = vault;
    // when
    const notes = await listNotes(dir);
    // then
    expect(notes.map((note) => note.path)).toEqual(['big.md', 'Inbox.md', 'Projects/Maple/Spike.md']);
    expect(notes.find((note) => note.path === 'Inbox.md')?.modifiedAt).toBe('2026-10-19T12:00:00.000Z');
  });

  test('readNote returns the note text', async () => {
    // given
    const path = 'Projects/Maple/Spike.md';
    // when
    const text = await readNote(vault, path);
    // then
    expect(text).toBe('## Findings\n');
  });

  test('readNote follows a symlink that stays inside the vault', async () => {
    // given
    symlinkSync(join(vault, 'Inbox.md'), join(vault, 'Alias.md'));
    // when
    const text = await readNote(vault, 'Alias.md');
    // then
    expect(text).toBe('# Inbox\n');
  });

  test.each([
    { name: 'a parent path', path: '../outside.md', error: 'reading note: path is outside the vault' },
    { name: 'an absolute path', path: '/etc/passwd.md', error: 'reading note: path is outside the vault' },
    {
      name: 'a symlink pointing out',
      path: 'link.md',
      link: true,
      error: 'reading note: path is outside the vault',
    },
    { name: 'a non-Markdown file', path: 'image.png', error: 'reading note: path is not a Markdown file' },
    { name: 'a file over the size limit', path: 'big.md', error: 'reading note: file is too large' },
    { name: 'a missing note', path: 'Missing.md', error: 'ENOENT' },
  ])('readNote rejects $name', async ({ path, link, error }) => {
    // given
    if (link) {
      symlinkSync(join(root, 'outside.md'), join(vault, path));
    }
    // when
    const text = readNote(vault, path);
    // then
    await expect(text).rejects.toThrow(error);
  });

  test('writeNote overwrites the note text', async () => {
    // given
    const path = 'Projects/Maple/Spike.md';
    // when
    await writeNote(vault, path, '## New\n');
    // then
    expect(await readNote(vault, path)).toBe('## New\n');
  });

  test.each([
    { name: 'a parent path', path: '../outside.md', error: 'writing note: path is outside the vault' },
    { name: 'an absolute path', path: '/etc/passwd.md', error: 'writing note: path is outside the vault' },
    {
      name: 'a symlink pointing out',
      path: 'link.md',
      link: true,
      error: 'writing note: path is outside the vault',
    },
    { name: 'a non-Markdown file', path: 'image.png', error: 'writing note: path is not a Markdown file' },
  ])('writeNote rejects $name', async ({ path, link, error }) => {
    // given
    if (link) {
      symlinkSync(join(root, 'outside.md'), join(vault, path));
    }
    // when
    const written = writeNote(vault, path, 'overwritten');
    // then
    await expect(written).rejects.toThrow(error);
    expect(readFileSync(join(root, 'outside.md'), 'utf8')).toBe('secret');
    expect(readFileSync(join(vault, 'image.png'), 'utf8')).toBe('png');
  });

  test('writeNote creates a note that does not exist yet', async () => {
    // given
    const path = 'New.md';
    // when
    await writeNote(vault, path, '# New\n');
    // then
    expect(readFileSync(join(vault, path), 'utf8')).toBe('# New\n');
  });

  test('writeNote rejects a note in a missing folder', async () => {
    // given
    const path = 'Missing/New.md';
    // when
    const written = writeNote(vault, path, '# New\n');
    // then
    await expect(written).rejects.toThrow('ENOENT');
  });
});
