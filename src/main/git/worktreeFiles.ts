import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FilePair } from '@shared/types/files/filePair';
import type { SearchHit } from '@shared/types/files/searchHit';
import { isInside, MAX_BYTES, realOrSelf } from '@main/util/paths';
import { runGit, showOrNull, splitZ } from './gitRunner';

const SNIFF_BYTES = 8000;
const MAX_HITS = 500;
const MAX_HIT_TEXT = 200;

export function isBinary(data: Buffer): boolean {
  return data.subarray(0, SNIFF_BYTES).includes(0);
}

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function listFiles(worktree: string): Promise<string[]> {
  return splitZ(await runGit(worktree, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']));
}

export async function searchFiles(worktree: string, query: string): Promise<SearchHit[]> {
  let output: string;
  try {
    output = await runGit(worktree, ['grep', '-n', '-I', '-i', '-F', '-z', '--untracked', '-e', query]);
  } catch (err) {
    if (err instanceof Error && err.cause instanceof Error && 'code' in err.cause && err.cause.code === 1) {
      return [];
    }
    throw err;
  }
  const hits: SearchHit[] = [];
  for (const row of output.split('\n')) {
    const [path, line, ...rest] = row.split('\0');
    if (rest.length === 0) {
      continue;
    }
    hits.push({ path, line: Number(line), text: rest.join('\0').slice(0, MAX_HIT_TEXT) });
    if (hits.length === MAX_HITS) {
      break;
    }
  }
  return hits;
}

async function insidePath(worktree: string, path: string): Promise<string | null> {
  const root = await realpath(worktree);
  const full = await realOrSelf(resolve(root, path));
  return isInside(root, full) ? full : null;
}

export async function writeWorktreeFile(worktree: string, path: string, text: string): Promise<void> {
  const full = await insidePath(worktree, path);
  if (full === null) {
    throw new Error('writing file: path is outside the worktree');
  }
  await writeFile(full, text);
}

export async function readFilePair(worktree: string, base: string, path: string): Promise<FilePair> {
  const full = await insidePath(worktree, path);
  if (full === null) {
    throw new Error('reading file: path is outside the worktree');
  }
  const info = await stat(full).catch(() => null);
  if (info !== null && !info.isFile()) {
    return { kind: 'binary', path };
  }
  if (info !== null && info.size > MAX_BYTES) {
    return { kind: 'tooLarge', path, bytes: info.size };
  }
  const current = await readOrNull(full);
  const old = await showOrNull(worktree, base, path);
  if ((current !== null && isBinary(current)) || (old !== null && isBinary(old))) {
    return { kind: 'binary', path };
  }
  return { kind: 'text', path, current: current?.toString('utf8') ?? null, base: old?.toString('utf8') ?? null };
}
