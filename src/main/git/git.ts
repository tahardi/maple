import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ChangeSet, FileChange, FilePair, SearchHit } from '@shared/types/files';
import { matchWorktrees } from '@shared/worktree/worktree';
import { isInside, MAX_BYTES, realOrSelf } from '@main/util/paths';

const execFileAsync = promisify(execFile);
export const NO_FSMONITOR = ['-c', 'core.fsmonitor=false'];
const SNIFF_BYTES = 8000;
const MAX_HITS = 500;
const MAX_HIT_TEXT = 200;
const defaultBranches = new Map<string, string>();

async function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...NO_FSMONITOR, ...args], {
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    });
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

type Unstamped = Omit<FileChange, 'stamp'>;

function parseNameStatus(output: string): Unstamped[] {
  const parts = splitZ(output);
  const files: Unstamped[] = [];
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

async function stampOrNull(path: string): Promise<string | null> {
  try {
    const info = await lstat(path);
    return `${String(info.size)}:${String(info.mtimeMs)}`;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

async function showOrNull(worktree: string, base: string, path: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync('git', [...NO_FSMONITOR, 'show', `${base}:${path}`], {
      cwd: worktree,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function findWorktrees(worktreesDir: string, cardKey: string): Promise<string[]> {
  const dirs = (await readdir(worktreesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const entries = await Promise.all(
    dirs.map(async (entry) => ({ name: entry.name, mtimeMs: (await stat(join(worktreesDir, entry.name))).mtimeMs })),
  );
  return matchWorktrees(entries, cardKey).map((name) => join(worktreesDir, name));
}

export async function currentBranch(worktree: string): Promise<string> {
  return (await git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

export async function headSha(worktree: string): Promise<string> {
  return (await git(worktree, ['rev-parse', 'HEAD'])).trim();
}

export async function gitCommonDir(worktree: string): Promise<string> {
  return (await git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
}

async function filterKeys(worktree: string): Promise<string[]> {
  try {
    return splitZ(await git(worktree, ['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.']));
  } catch (err) {
    if (err instanceof Error && err.cause instanceof Error && 'code' in err.cause && err.cause.code === 1) {
      return [];
    }
    throw err;
  }
}

async function noFiltersEnv(worktree: string): Promise<NodeJS.ProcessEnv> {
  const names = new Set((await filterKeys(worktree)).map((key) => key.slice('filter.'.length, key.lastIndexOf('.'))));
  const overrides = [...names].flatMap((name) => [
    [`filter.${name}.clean`, ''],
    [`filter.${name}.smudge`, ''],
    [`filter.${name}.process`, ''],
    [`filter.${name}.required`, 'false'],
  ]);
  return {
    GIT_CONFIG_COUNT: String(overrides.length),
    ...Object.fromEntries(
      overrides.flatMap(([key, value], i) => [
        [`GIT_CONFIG_KEY_${String(i)}`, key],
        [`GIT_CONFIG_VALUE_${String(i)}`, value],
      ]),
    ),
  };
}

export async function repoName(worktree: string): Promise<string> {
  let url: string;
  try {
    url = await git(worktree, ['remote', 'get-url', 'origin']);
  } catch {
    return basename(dirname(await gitCommonDir(worktree)));
  }
  const path = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf(':')) + 1);
}

async function resolves(worktree: string, name: string): Promise<boolean> {
  try {
    await git(worktree, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function defaultBranch(worktree: string): Promise<string | null> {
  const head = await git(worktree, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '');
  const candidates = [head.trim(), 'origin/main', 'origin/master', 'main', 'master'].filter((name) => name !== '');
  for (const name of candidates) {
    if (await resolves(worktree, name)) {
      return name;
    }
  }
  return null;
}

async function baseOf(worktree: string, branch: string): Promise<string | null> {
  try {
    return (await git(worktree, ['merge-base', branch, 'HEAD'])).trim();
  } catch (err) {
    if (err instanceof Error && err.cause instanceof Error && 'code' in err.cause && err.cause.code === 1) {
      return null;
    }
    throw err;
  }
}

export async function mergeBase(worktree: string): Promise<string | null> {
  const cached = defaultBranches.get(worktree);
  if (cached !== undefined && (await resolves(worktree, cached))) {
    return baseOf(worktree, cached);
  }
  const branch = await defaultBranch(worktree);
  if (branch === null) {
    defaultBranches.delete(worktree);
    return null;
  }
  defaultBranches.set(worktree, branch);
  return baseOf(worktree, branch);
}

export async function changes(worktree: string): Promise<ChangeSet | null> {
  const base = await mergeBase(worktree);
  if (base === null) {
    return null;
  }
  const noFilters = await noFiltersEnv(worktree);
  const [nameStatus, numstat, untracked] = await Promise.all([
    git(worktree, ['diff', '--name-status', '-M', '-z', base], noFilters),
    git(worktree, ['diff', '--numstat', '-M', base], noFilters),
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
  const unstamped: Unstamped[] = [
    ...parseNameStatus(nameStatus),
    ...untrackedPaths.map((path): Unstamped => ({ path, status: 'A', oldPath: null })),
  ];
  const files = await Promise.all(
    unstamped.map(async (file): Promise<FileChange> => ({
      ...file,
      stamp: file.status === 'D' ? null : await stampOrNull(join(worktree, file.path)),
    })),
  );
  return {
    base,
    files,
    added: added + untrackedLines.reduce((sum, n) => sum + n, 0),
    removed,
  };
}

export async function listFiles(worktree: string): Promise<string[]> {
  return splitZ(await git(worktree, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']));
}

export async function searchFiles(worktree: string, query: string): Promise<SearchHit[]> {
  let output: string;
  try {
    output = await git(worktree, ['grep', '-n', '-I', '-i', '-F', '-z', '--untracked', '-e', query]);
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
