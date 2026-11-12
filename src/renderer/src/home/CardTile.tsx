import type { Card } from '@shared/types/jira/card';
import { EpicLozenge } from './EpicLozenge';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { QueueControls } from '@renderer/home/startQueue/QueueControls';
import styles from './CardTile.module.css';

type Props = {
  card: Card;
  selected: boolean;
  onSelect: (key: string) => void;
  onToggle: ((key: string) => void) | null;
  onStart: ((key: string) => void) | null;
  starting: boolean;
  queued: readonly string[];
};

export function CardTile({ card, selected, onSelect, onToggle, onStart, starting, queued }: Props) {
  const place = queued.indexOf(card.key);
  const blockers = card.blockedBy.filter((b) => b.status !== 'Done').map((b) => b.key);

  const tile = (
    <button
      className={styles.tile}
      data-key={card.key}
      data-blocked={blockers.length > 0 ? 'true' : undefined}
      data-highlighted={selected ? 'true' : undefined}
      onClick={() => {
        onSelect(card.key);
      }}
    >
      <span className={styles.key}>{card.key}</span>
      <span>{card.summary}</span>
      <span className={styles.meta}>
        {card.epic && <EpicLozenge epic={card.epic} />}
        {card.points !== null && <span>{`${String(card.points)} pts`}</span>}
        {card.labels.map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
      </span>
      {blockers.length > 0 && <span className={styles.blocked}>{`⛔ Blocked by ${blockers.join(', ')}`}</span>}
    </button>
  );

  if (onToggle === null && onStart === null && place < 0) {
    return tile;
  }
  if (place >= 0) {
    return (
      <div className={styles.selectable} data-queued="true">
        {tile}
        <span className={styles.queue}>
          <span className={styles.queueControls}>
            <QueueControls cardKey={card.key} index={place} count={queued.length} />
          </span>
          <Badge tone="info">{`Queued #${String(place + 1)}`}</Badge>
        </span>
      </div>
    );
  }
  return (
    <div className={styles.selectable}>
      {onToggle && (
        <input
          type="checkbox"
          className={styles.check}
          aria-label={`Select ${card.key}`}
          checked={selected}
          onChange={() => {
            onToggle(card.key);
          }}
        />
      )}
      {tile}
      {onStart && (
        <span className={styles.start}>
          <Button
            label="Start"
            ariaLabel={`Start ${card.key}`}
            variant="primary"
            onClick={() => {
              onStart(card.key);
            }}
            busy={starting}
            busyLabel="Starting…"
          />
        </span>
      )}
    </div>
  );
}
