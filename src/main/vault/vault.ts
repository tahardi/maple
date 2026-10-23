import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { VaultNote } from '@shared/types/files';
import { isInside, MAX_BYTES, realOrSelf } from '@main/app/paths';

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

async function notePath(vaultDir: string, path: string, verb: 'reading' | 'writing'): Promise<string> {
  const root = await realpath(vaultDir);
  const full = await realOrSelf(resolve(root, path));
  if (!isInside(root, full)) {
    throw new Error(`${verb} note: path is outside the vault`);
  }
  if (!full.endsWith('.md')) {
    throw new Error(`${verb} note: path is not a Markdown file`);
  }
  return full;
}

export async function readNote(vaultDir: string, path: string): Promise<string> {
  const full = await notePath(vaultDir, path, 'reading');
  const info = await stat(full);
  if (info.size > MAX_BYTES) {
    throw new Error('reading note: file is too large');
  }
  return readFile(full, 'utf8');
}

export async function writeNote(vaultDir: string, path: string, text: string): Promise<void> {
  await writeFile(await notePath(vaultDir, path, 'writing'), text);
}
