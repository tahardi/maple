import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChangeSet } from '@shared/types/files/changeSet';
import type { FileChange } from '@shared/types/files/fileChange';
import { MAX_BYTES } from '@main/util/paths';
import { runGit, splitZ } from './gitRunner';
import { commitExists, defaultBranch } from './repoIdentity';
import { isBinary } from './worktreeFiles';

const defaultBranches = new Map<string, string>();

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

async function filterKeys(worktree: string): Promise<string[]> {
  try {
    return splitZ(await runGit(worktree, ['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.']));
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

async function baseOf(worktree: string, branch: string): Promise<string | null> {
  try {
    return (await runGit(worktree, ['merge-base', branch, 'HEAD'])).trim();
  } catch (err) {
    if (err instanceof Error && err.cause instanceof Error && 'code' in err.cause && err.cause.code === 1) {
      return null;
    }
    throw err;
  }
}

export async function mergeBase(worktree: string): Promise<string | null> {
  const cached = defaultBranches.get(worktree);
  if (cached !== undefined && (await commitExists(worktree, cached))) {
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
    runGit(worktree, ['diff', '--name-status', '-M', '-z', base], noFilters),
    runGit(worktree, ['diff', '--numstat', '-M', base], noFilters),
    runGit(worktree, ['ls-files', '--others', '--exclude-standard', '-z']),
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
