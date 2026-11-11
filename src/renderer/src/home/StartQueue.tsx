import type { QueueState, WaitReason } from '@shared/types/queue';
import styles from './StartQueue.module.css';

const WAITING_FOR: Record<'cpu' | 'memory', string> = { cpu: 'CPU', memory: 'memory' };

function waitText(reason: WaitReason, working: number, limit: number): string {
  if (reason === 'room') {
    return `Waiting for room: ${String(working)} of ${String(limit)} working`;
  }
  if (reason === 'pace') {
    return `Starting one more every 15 seconds: ${String(working)} working`;
  }
  return `Waiting for ${WAITING_FOR[reason]}: ${String(working)} working`;
}

export function StartQueue({ queue }: { queue: QueueState }) {
  const { cards, working, limit, waitingFor, failure } = queue;
  if (cards.length === 0 && failure === null) {
    return null;
  }
  return (
    <div className={styles.queue}>
      {cards.length > 0 && (
        <ul aria-label="Start queue" className={styles.list}>
          {cards.map(({ cardKey }, i) => (
            <li key={cardKey} className={styles.row}>
              <span className={styles.key}>{cardKey}</span>
              <button
                aria-label={`Move ${cardKey} up`}
                disabled={i === 0}
                onClick={() => void window.maple.tabs.moveQueued(cardKey, -1)}
              >
                ↑
              </button>
              <button
                aria-label={`Move ${cardKey} down`}
                disabled={i === cards.length - 1}
                onClick={() => void window.maple.tabs.moveQueued(cardKey, 1)}
              >
                ↓
              </button>
              <button
                aria-label={`Remove ${cardKey} from the queue`}
                onClick={() => void window.maple.tabs.unqueue(cardKey)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {cards.length > 0 && waitingFor !== null && (
        <span className={styles.waiting}>{waitText(waitingFor, working, limit)}</span>
      )}
      {failure !== null && (
        <span role="alert" className={styles.failure}>
          {failure}
        </span>
      )}
    </div>
  );
}
