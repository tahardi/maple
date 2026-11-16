import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_BYTES } from '@main/util/paths';
import {
  createFolder,
  createNote,
  duplicateNote,
  listNotes,
  openInObsidian,
  readNote,
  renameNote,
  trashNote,
  writeNote,
} from './vault';

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

  test('createNote creates an empty note', async () => {
    // given
    const path = 'Projects/Plan.md';
    // when
    await createNote(vault, path);
    // then
    expect(readFileSync(join(vault, path), 'utf8')).toBe('');
  });

  test('createNote rejects a name that already exists', async () => {
    // given
    const path = 'Inbox.md';
    // when
    const created = createNote(vault, path);
    // then
    await expect(created).rejects.toThrow('creating note: a note with that name already exists');
    expect(readFileSync(join(vault, path), 'utf8')).toBe('# Inbox\n');
  });

  test('createNote rejects a path outside the vault', async () => {
    // given
    const path = '../outside.md';
    // when
    const created = createNote(vault, path);
    // then
    await expect(created).rejects.toThrow('creating note: path is outside the vault');
    expect(readFileSync(join(root, 'outside.md'), 'utf8')).toBe('secret');
  });

  test('createNote rejects a name that is not Markdown', async () => {
    // given
    const path = 'Plan.txt';
    // when
    const created = createNote(vault, path);
    // then
    await expect(created).rejects.toThrow('creating note: path is not a Markdown file');
    expect(existsSync(join(vault, path))).toBe(false);
  });

  test('createFolder creates a folder', async () => {
    // given
    const path = 'Projects/Ideas';
    // when
    await createFolder(vault, path);
    // then
    expect(statSync(join(vault, path)).isDirectory()).toBe(true);
  });

  test('createFolder rejects a name that already exists', async () => {
    // given
    const path = 'Projects';
    // when
    const created = createFolder(vault, path);
    // then
    await expect(created).rejects.toThrow('creating folder: a folder with that name already exists');
  });

  test('createFolder rejects a path outside the vault', async () => {
    // given
    const path = '../x';
    // when
    const created = createFolder(vault, path);
    // then
    await expect(created).rejects.toThrow('creating folder: path is outside the vault');
    expect(existsSync(join(root, 'x'))).toBe(false);
  });

  test('trashNote passes the full note path to the trash', async () => {
    // given
    const trash = vi.fn(() => Promise.resolve());
    // when
    await trashNote(vault, 'Projects/Maple/Spike.md', trash);
    // then
    expect(trash).toHaveBeenCalledWith(join(realpathSync(vault), 'Projects', 'Maple', 'Spike.md'));
  });

  test('trashNote trashes a symlink, not the note it points to', async () => {
    // given
    symlinkSync(join(vault, 'Inbox.md'), join(vault, 'Alias.md'));
    const trash = vi.fn(() => Promise.resolve());
    // when
    await trashNote(vault, 'Alias.md', trash);
    // then
    expect(trash).toHaveBeenCalledWith(join(realpathSync(vault), 'Alias.md'));
  });

  test('trashNote rejects a path outside the vault', async () => {
    // given
    const trash = vi.fn(() => Promise.resolve());
    // when
    const trashed = trashNote(vault, '../outside.md', trash);
    // then
    await expect(trashed).rejects.toThrow('trashing note: path is outside the vault');
    expect(trash).not.toHaveBeenCalled();
  });

  test('trashNote rejects a folder', async () => {
    // given
    const trash = vi.fn(() => Promise.resolve());
    // when
    const trashed = trashNote(vault, 'Projects', trash);
    // then
    await expect(trashed).rejects.toThrow('trashing note: path is not a Markdown file');
    expect(trash).not.toHaveBeenCalled();
  });

  test('renameNote moves the note to its new name', async () => {
    // given
    const to = 'Projects/Inbox.md';
    // when
    await renameNote(vault, 'Inbox.md', to);
    // then
    expect(readFileSync(join(vault, to), 'utf8')).toBe('# Inbox\n');
    expect(existsSync(join(vault, 'Inbox.md'))).toBe(false);
  });

  test('renameNote rejects a name that already exists', async () => {
    // given
    writeFileSync(join(vault, 'Taken.md'), '# Taken\n');
    // when
    const renamed = renameNote(vault, 'Inbox.md', 'Taken.md');
    // then
    await expect(renamed).rejects.toThrow('renaming note: a note with that name already exists');
    expect(readFileSync(join(vault, 'Inbox.md'), 'utf8')).toBe('# Inbox\n');
    expect(readFileSync(join(vault, 'Taken.md'), 'utf8')).toBe('# Taken\n');
  });

  test('renameNote rejects a path outside the vault', async () => {
    // given
    const to = '../moved.md';
    // when
    const renamed = renameNote(vault, 'Inbox.md', to);
    // then
    await expect(renamed).rejects.toThrow('renaming note: path is outside the vault');
    expect(existsSync(join(root, 'moved.md'))).toBe(false);
    expect(existsSync(join(vault, 'Inbox.md'))).toBe(true);
  });

  test.each([
    { existing: [], made: 'Inbox 1.md' },
    { existing: ['Inbox 1.md'], made: 'Inbox 2.md' },
  ])('duplicateNote copies the note to $made', async ({ existing, made }) => {
    // given
    for (const name of existing) {
      writeFileSync(join(vault, name), 'taken');
    }
    // when
    const path = await duplicateNote(vault, 'Inbox.md');
    // then
    expect(path).toBe(made);
    expect(readFileSync(join(vault, made), 'utf8')).toBe('# Inbox\n');
  });

  test('openInObsidian opens the full note path as an Obsidian link', async () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    // when
    await openInObsidian(vault, 'Projects/Maple/Spike.md', open);
    // then
    const full = join(realpathSync(vault), 'Projects', 'Maple', 'Spike.md');
    expect(open).toHaveBeenCalledWith(`obsidian://open?path=${encodeURIComponent(full)}`);
  });

  test('openInObsidian rejects a path outside the vault', async () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    // when
    const opened = openInObsidian(vault, '../outside.md', open);
    // then
    await expect(opened).rejects.toThrow('opening note: path is outside the vault');
    expect(open).not.toHaveBeenCalled();
  });
});
