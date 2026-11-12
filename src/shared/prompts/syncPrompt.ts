export function syncPrompt(key: string, worktrees: readonly string[] = []): string {
  const where = worktrees.length === 0 ? '' : ` in ${worktrees.join(', ')}`;
  return `Run the "Sync with Main" steps from the /card skill for ${key}${where}.`;
}
