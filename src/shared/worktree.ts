export function matchWorktrees(entries: { name: string; mtimeMs: number }[], cardKey: string): string[] {
  const key = `-${cardKey.toLowerCase()}`;
  return entries
    .filter((entry) => entry.name.includes(`${key}-`) || entry.name.endsWith(key))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((entry) => entry.name);
}

export function worktreeRepo(worktree: string, repos: string[]): string | null {
  const folder = (worktree.split('/').at(-1) ?? '').toLowerCase();
  const named = repos.filter((repo) => folder.startsWith(`${(repo.split('/')[1] ?? '').toLowerCase()}-`));
  return named.reduce<string | null>((best, repo) => (best === null || repo.length > best.length ? repo : best), null);
}
