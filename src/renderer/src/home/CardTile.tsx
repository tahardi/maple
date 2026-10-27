import type { Card } from '@shared/types/jira';
import { EpicLozenge } from './EpicLozenge';
import styles from './CardTile.module.css';

type Props = {
  card: Card;
  selected: boolean;
  onSelect: (key: string) => void;
  onToggle: ((key: string) => void) | null;
};

export function CardTile({ card, selected, onSelect, onToggle }: Props) {
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
          <span key={label} className={styles.label}>
            {label}
          </span>
        ))}
      </span>
      {blockers.length > 0 && <span className={styles.blocked}>{`blocked by ${blockers.join(', ')}`}</span>}
    </button>
  );

  if (onToggle === null) {
    return tile;
  }
  return (
    <div className={styles.selectable}>
      <input
        type="checkbox"
        className={styles.check}
        aria-label={`Select ${card.key}`}
        checked={selected}
        onChange={() => {
          onToggle(card.key);
        }}
      />
      {tile}
    </div>
  );
}
