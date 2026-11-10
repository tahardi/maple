import { appLogger, type Logger } from '@main/app/log';
import type { TabState } from '@shared/types/tabs';
import type { SessionManager } from './sessions';
import type { SavedState } from '@main/app/state';

function reopen(tab: TabState, sessions: SessionManager): TabState {
  if (tab.kind === 'vault') {
    return sessions.openVault(tab.projectKey, tab.sessionId, tab.id);
  }
  if (tab.cardKey === null) {
    return sessions.openPlanner(tab.projectKey, tab.sessionId, tab.id);
  }
  return sessions.openCard(tab.projectKey, tab.cardKey, tab.sessionId, tab.id);
}

export async function restoreTabs(
  saved: SavedState,
  sessions: SessionManager,
  findWt: (key: string) => Promise<string[]>,
  logger: Logger = appLogger,
): Promise<{ restored: number; warnings: string[] }> {
  const warnings: string[] = [];
  let restored = 0;
  const release = sessions.holdSaves();
  try {
    for (const tab of saved.tabs) {
      const name = tab.cardKey ?? `${tab.projectKey} ${tab.kind}`;
      if (!sessions.hasProject(tab.projectKey)) {
        warnings.push(`dropped ${name}: project ${tab.projectKey} is not in config`);
        logger.warn('restore', 'dropped', { tab: name, reason: 'project not in config' });
        continue;
      }
      let opened: TabState;
      try {
        opened = reopen(tab, sessions);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        sessions.keep(tab);
        warnings.push(`kept ${name} for the next launch: ${reason}`);
        logger.warn('restore', 'kept', { tab: name, reason });
        continue;
      }
      restored += 1;
      const { cardKey } = tab;
      if (cardKey === null) {
        logger.info('restore', 'restored', { projectKey: tab.projectKey, kind: opened.kind });
        continue;
      }
      logger.info('restore', 'restored', { projectKey: tab.projectKey, cardKey });
      const paths = await findWt(cardKey).catch((err: unknown): string[] => {
        const error = err instanceof Error ? err.message : String(err);
        logger.warn('worktree', 'failed', { operation: 'findWorktrees', cardKey, error });
        return [];
      });
      if (paths.length === 0) {
        logger.info('worktree', 'gone', { cardKey });
      } else {
        logger.info('worktree', 'found', { cardKey, paths });
        if (sessions.get(opened.id) !== null) {
          sessions.setWorktrees(opened.id, paths);
          if (tab.worktreePath !== null && paths.includes(tab.worktreePath)) {
            sessions.selectWorktree(opened.id, tab.worktreePath);
          }
        }
      }
    }
  } finally {
    release();
  }
  return { restored, warnings };
}
