import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { VaultNote } from '@shared/types/files/vaultNote';
import { isInside, MAX_BYTES, realOrSelf } from '@main/util/paths';

async function walk(vaultDir: string, dir: string): Promise<VaultNote[]> {
  const entries = await readdir(join(vaultDir, dir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<VaultNote[]> => {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        return entry.name.startsWith('.') ? [] : walk(vaultDir, path);
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        return [];
      }
      const info = await stat(join(vaultDir, path));
      return [{ path, modifiedAt: info.mtime.toISOString() }];
    }),
  );
  return nested.flat();
}

export async function listNotes(vaultDir: string): Promise<VaultNote[]> {
  return (await walk(vaultDir, '')).sort((a, b) => a.path.localeCompare(b.path));
}

type Verb = 'reading' | 'writing' | 'creating' | 'trashing';

async function vaultPath(vaultDir: string, path: string, action: string): Promise<{ link: string; full: string }> {
  const root = await realpath(vaultDir);
  const link = resolve(root, path);
  const full = await realOrSelf(link);
  if (!isInside(root, link) || !isInside(root, full)) {
    throw new Error(`${action}: path is outside the vault`);
  }
  return { link, full };
}

async function notePath(vaultDir: string, path: string, verb: Verb): Promise<{ link: string; full: string }> {
  const paths = await vaultPath(vaultDir, path, `${verb} note`);
  if (!paths.full.endsWith('.md')) {
    throw new Error(`${verb} note: path is not a Markdown file`);
  }
  return paths;
}

function isTaken(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'EEXIST';
}

export async function readNote(vaultDir: string, path: string): Promise<string> {
  const { full } = await notePath(vaultDir, path, 'reading');
  const info = await stat(full);
  if (info.size > MAX_BYTES) {
    throw new Error('reading note: file is too large');
  }
  return readFile(full, 'utf8');
}

export async function writeNote(vaultDir: string, path: string, text: string): Promise<void> {
  await writeFile((await notePath(vaultDir, path, 'writing')).full, text);
}

export async function createNote(vaultDir: string, path: string): Promise<void> {
  const { full } = await notePath(vaultDir, path, 'creating');
  try {
    await writeFile(full, '', { flag: 'wx' });
  } catch (err) {
    if (isTaken(err)) {
      throw new Error('creating note: a note with that name already exists');
    }
    throw err;
  }
}

export async function createFolder(vaultDir: string, path: string): Promise<void> {
  const { full } = await vaultPath(vaultDir, path, 'creating folder');
  try {
    await mkdir(full);
  } catch (err) {
    if (isTaken(err)) {
      throw new Error('creating folder: a folder with that name already exists');
    }
    throw err;
  }
}

export async function trashNote(vaultDir: string, path: string, trash: (full: string) => Promise<void>): Promise<void> {
  await trash((await notePath(vaultDir, path, 'trashing')).link);
}
