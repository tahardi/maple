import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { matchWorktrees } from '@shared/worktree/worktree';

export async function findWorktrees(worktreesDir: string, cardKey: string): Promise<string[]> {
  const dirs = (await readdir(worktreesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const entries = await Promise.all(
    dirs.map(async (entry) => ({ name: entry.name, mtimeMs: (await stat(join(worktreesDir, entry.name))).mtimeMs })),
  );
  return matchWorktrees(entries, cardKey).map((name) => join(worktreesDir, name));
}
