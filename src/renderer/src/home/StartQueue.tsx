import type { QueueState, WaitReason } from '@shared/types/queue';
import styles from './StartQueue.module.css';

const WAITING_FOR: Record<WaitReason, string> = { room: 'room', cpu: 'CPU', memory: 'memory' };

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
        <span className={styles.waiting}>
          {`Waiting for ${WAITING_FOR[waitingFor]}: ${String(working)} of ${String(limit)} working`}
        </span>
      )}
      {failure !== null && (
        <span role="alert" className={styles.failure}>
          {failure}
        </span>
      )}
    </div>
  );
}
