import { appLogger, type Logger } from '@main/app/log';
import type { SessionManager } from './sessions';
import type { SavedState } from '@main/app/state';

export async function restoreTabs(
  saved: SavedState,
  sessions: SessionManager,
  findWt: (key: string) => Promise<string | null>,
  logger: Logger = appLogger,
): Promise<{ restored: number; warnings: string[] }> {
  const warnings: string[] = [];
  let restored = 0;
  for (const tab of saved.tabs) {
    if (!sessions.hasProject(tab.projectKey)) {
      const name = tab.cardKey ?? `${tab.projectKey} ${tab.kind}`;
      warnings.push(`dropped ${name}: project ${tab.projectKey} is not in config`);
      logger.warn('restore', 'dropped', { tab: name, reason: 'project not in config' });
      continue;
    }
    if (tab.kind === 'vault') {
      try {
        sessions.openVault(tab.projectKey, tab.sessionId, tab.id);
      } catch (err) {
        const name = `${tab.projectKey} vault`;
        const reason = err instanceof Error ? err.message : String(err);
        warnings.push(`dropped ${name}: ${reason}`);
        logger.warn('restore', 'dropped', { tab: name, reason });
        continue;
      }
      restored += 1;
      logger.info('restore', 'restored', { projectKey: tab.projectKey, kind: 'vault' });
      continue;
    }
    restored += 1;
    if (tab.cardKey === null) {
      sessions.openPlanner(tab.projectKey, tab.sessionId, tab.id);
      logger.info('restore', 'restored', { projectKey: tab.projectKey, kind: 'planner' });
      continue;
    }
    const opened = sessions.openCard(tab.projectKey, tab.cardKey, tab.sessionId, tab.id);
    logger.info('restore', 'restored', { projectKey: tab.projectKey, cardKey: tab.cardKey });
    const { cardKey } = tab;
    const path = await findWt(cardKey).catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('worktree', 'failed', { operation: 'findWorktree', cardKey, error });
      return null;
    });
    if (path === null) {
      logger.info('worktree', 'gone', { cardKey: tab.cardKey });
    } else {
      logger.info('worktree', 'found', { cardKey: tab.cardKey, path });
      sessions.setWorktree(opened.id, path);
    }
  }
  return { restored, warnings };
}
