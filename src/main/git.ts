import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { ChangeSet, FileChange, FilePair } from '@shared/types';
import { matchWorktree } from '@shared/worktree';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 2_097_152;
const SNIFF_BYTES = 8000;

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    throw new Error(`running git ${args.join(' ')}: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
}

function splitZ(output: string): string[] {
  return output.split('\0').filter((part) => part !== '');
}

function isBinary(data: Buffer): boolean {
  return data.subarray(0, SNIFF_BYTES).includes(0);
}

function countLines(data: Buffer): number {
  if (data.length === 0 || isBinary(data)) {
    return 0;
  }
  const newlines = data.filter((byte) => byte === 0x0a).length;
  return data.at(-1) === 0x0a ? newlines : newlines + 1;
}

function parseNameStatus(output: string): FileChange[] {
  const parts = splitZ(output);
  const files: FileChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].charAt(0);
    if (code === 'R' || code === 'C') {
      const oldPath = parts[i + 1];
      const path = parts[i + 2];
      i += 2;
      files.push(code === 'R' ? { path, status: 'R', oldPath } : { path, status: 'A', oldPath: null });
      continue;
    }
    const path = parts[i + 1];
    i += 1;
    files.push({ path, status: code === 'A' || code === 'D' ? code : 'M', oldPath: null });
  }
  return files;
}

function sumNumstat(output: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const row of output.split('\n')) {
    const [a, r] = row.split('\t');
    added += Number(a) || 0;
    removed += Number(r) || 0;
  }
  return { added, removed };
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

async function showOrNull(worktree: string, base: string, path: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${base}:${path}`], {
      cwd: worktree,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function findWorktree(worktreesDir: string, cardKey: string): Promise<string | null> {
  const dirs = (await readdir(worktreesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const entries = await Promise.all(
    dirs.map(async (entry) => ({ name: entry.name, mtimeMs: (await stat(join(worktreesDir, entry.name))).mtimeMs })),
  );
  const name = matchWorktree(entries, cardKey);
  return name === null ? null : join(worktreesDir, name);
}

export async function currentBranch(worktree: string): Promise<string> {
  return (await git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

export async function mergeBase(worktree: string): Promise<string> {
  return (await git(worktree, ['merge-base', 'origin/main', 'HEAD'])).trim();
}

export async function changes(worktree: string): Promise<ChangeSet> {
  const base = await mergeBase(worktree);
  const [nameStatus, numstat, untracked] = await Promise.all([
    git(worktree, ['diff', '--name-status', '-M', '-z', base]),
    git(worktree, ['diff', '--numstat', '-M', base]),
    git(worktree, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  const untrackedPaths = splitZ(untracked);
  const untrackedLines = await Promise.all(
    untrackedPaths.map(async (path) => {
      const full = join(worktree, path);
      const info = await lstat(full);
      return info.isFile() && info.size <= MAX_BYTES ? countLines(await readFile(full)) : 0;
    }),
  );
  const { added, removed } = sumNumstat(numstat);
  return {
    base,
    files: [
      ...parseNameStatus(nameStatus),
      ...untrackedPaths.map((path): FileChange => ({ path, status: 'A', oldPath: null })),
    ],
    added: added + untrackedLines.reduce((sum, n) => sum + n, 0),
    removed,
  };
}

export async function listFiles(worktree: string): Promise<string[]> {
  return splitZ(await git(worktree, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']));
}

function isInside(root: string, full: string): boolean {
  const inside = relative(root, full);
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

async function realOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return path;
    }
    throw err;
  }
}

export async function readFilePair(worktree: string, base: string, path: string): Promise<FilePair> {
  const root = await realpath(worktree);
  const full = await realOrSelf(resolve(root, path));
  if (!isInside(root, full)) {
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
