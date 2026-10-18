export function matchWorktree(entries: { name: string; mtimeMs: number }[], cardKey: string): string | null {
  const key = `-${cardKey.toLowerCase()}`;
  const matches = entries.filter((entry) => entry.name.includes(`${key}-`) || entry.name.endsWith(key));
  const newest = matches.reduce<{ name: string; mtimeMs: number } | null>(
    (best, entry) => (best === null || entry.mtimeMs > best.mtimeMs ? entry : best),
    null,
  );
  return newest?.name ?? null;
}
