import type { QueueState } from '@shared/types/queue/queueState';
import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import styles from './StartQueue.module.css';
import { waitText } from './waitText';

export function StartQueue({ queue, titles }: { queue: QueueState; titles: ReadonlyMap<string, string> }) {
  const [open, setOpen] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  const { cards } = queue;
  if (open && cards.length === 0) {
    setOpen(false);
  }
  useDismiss(root, open, close);
  if (cards.length === 0) {
    return null;
  }
  const wait = waitText(queue);
  return (
    <div ref={root} className={styles.queue}>
      <button
        className={styles.pill}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {`${String(cards.length)} queued${wait === null ? '' : ` · ${wait}`}`}
      </button>
      {open && (
        <ul aria-label="Start queue" className={styles.popover}>
          {cards.map(({ cardKey }, i) => (
            <li
              key={cardKey}
              className={styles.row}
              draggable
              data-dragging={dragged === cardKey ? 'true' : undefined}
              onDragStart={() => {
                setDragged(cardKey);
              }}
              onDragEnd={() => {
                setDragged(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged !== null && dragged !== cardKey) {
                  void window.maple.tabs.moveQueued(dragged, i);
                }
                setDragged(null);
              }}
            >
              <span className={styles.card}>
                {[`#${String(i + 1)}`, cardKey, titles.get(cardKey)].filter(Boolean).join(' ')}
              </span>
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
    </div>
  );
}
