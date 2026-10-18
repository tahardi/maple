import type { SessionManager } from './sessions';
import type { SavedState } from './state';

export async function restoreTabs(
  saved: SavedState,
  sessions: SessionManager,
  findWt: (key: string) => Promise<string | null>,
): Promise<{ restored: number; warnings: string[] }> {
  const warnings: string[] = [];
  let restored = 0;
  for (const tab of saved.tabs) {
    if (!sessions.hasProject(tab.projectKey)) {
      const name = tab.cardKey ?? `${tab.projectKey} planner`;
      warnings.push(`dropped ${name}: project ${tab.projectKey} is not in config`);
      continue;
    }
    restored += 1;
    if (tab.cardKey === null) {
      sessions.openPlanner(tab.projectKey, tab.sessionId);
      continue;
    }
    const opened = sessions.openCard(tab.projectKey, tab.cardKey, tab.sessionId);
    const path = await findWt(tab.cardKey).catch(() => null);
    if (path !== null) {
      sessions.setWorktree(opened.id, path);
    }
  }
  return { restored, warnings };
}
