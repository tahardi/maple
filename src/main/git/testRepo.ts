import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function gitIn(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'ignore' },
  );
}

export function buildRepo(root: string): string {
  const origin = join(root, 'origin.git');
  const repo = join(root, 'repo');
  const worktree = join(root, 'wts', 'maple-mpl-1-feature');
  mkdirSync(repo);
  gitIn(root, 'init', '--bare', '-b', 'main', origin);
  gitIn(repo, 'init', '-b', 'main');
  writeFileSync(join(repo, 'keep.txt'), 'a\nb\nc\n');
  writeFileSync(join(repo, 'del.txt'), 'x\n');
  writeFileSync(join(repo, 'old.txt'), 'r1\nr2\nr3\nr4\n');
  writeFileSync(join(repo, 'logo.bin'), Buffer.from([0x89, 0x00, 0x50]));
  writeFileSync(join(repo, '.gitignore'), 'ignored.log\n');
  gitIn(repo, 'add', '.');
  gitIn(repo, 'commit', '-m', 'main');
  gitIn(repo, 'remote', 'add', 'origin', origin);
  gitIn(repo, 'push', '-u', 'origin', 'main');
  gitIn(repo, 'worktree', 'add', worktree, '-b', 'feature', 'origin/main');
  return worktree;
}
