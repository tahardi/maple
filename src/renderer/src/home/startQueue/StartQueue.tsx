import type { QueueState } from '@shared/types/queue/queueState';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './StartQueue.module.css';
import { waitText } from './waitText';

export function StartQueue({ queue }: { queue: QueueState }) {
  const { cards, failure } = queue;
  const wait = waitText(queue);
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
      {cards.length > 0 && wait !== null && <span className={styles.waiting}>{wait}</span>}
      {failure !== null && <Notice tone="danger">{failure}</Notice>}
    </div>
  );
}
