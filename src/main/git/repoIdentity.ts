import { basename, dirname } from 'node:path';
import { runGit } from './gitRunner';

export async function currentBranch(worktree: string): Promise<string> {
  return (await runGit(worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

export async function headSha(worktree: string): Promise<string> {
  return (await runGit(worktree, ['rev-parse', 'HEAD'])).trim();
}

export async function gitCommonDir(worktree: string): Promise<string> {
  return (await runGit(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
}

export async function repoName(worktree: string): Promise<string> {
  let url: string;
  try {
    url = await runGit(worktree, ['remote', 'get-url', 'origin']);
  } catch {
    return basename(dirname(await gitCommonDir(worktree)));
  }
  const path = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf(':')) + 1);
}

export async function commitExists(worktree: string, name: string): Promise<boolean> {
  try {
    await runGit(worktree, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function defaultBranch(worktree: string): Promise<string | null> {
  const head = await runGit(worktree, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '');
  const candidates = [head.trim(), 'origin/main', 'origin/master', 'main', 'master'].filter((name) => name !== '');
  for (const name of candidates) {
    if (await commitExists(worktree, name)) {
      return name;
    }
  }
  return null;
}
