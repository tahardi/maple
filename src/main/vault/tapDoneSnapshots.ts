import type { Card } from '@shared/types/jira/card';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { removeSnapshots } from './snapshots';

export function tapDoneSnapshots(
  getCard: (key: string) => Promise<Card>,
  sessionOf: (cardKey: string) => string | null,
  remove: (sessionId: string) => Promise<void> = removeSnapshots,
  logger: Logger = appLogger,
): (key: string) => Promise<Card> {
  const removed = new Set<string>();
  return async (key) => {
    const card = await getCard(key);
    const sessionId = card.status === 'Done' ? sessionOf(key) : null;
    if (sessionId !== null && !removed.has(sessionId)) {
      removed.add(sessionId);
      logFailure(logger, 'vault', { operation: 'removeSnapshots', args: [sessionId] }, () => remove(sessionId)).catch(
        () => undefined,
      );
    }
    return card;
  };
}
