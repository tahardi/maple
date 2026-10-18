import type { Card } from '@shared/types';
import styles from './CardTile.module.css';

type Props = { card: Card; highlighted: boolean; onSelect: (key: string) => void };

export function CardTile({ card, highlighted, onSelect }: Props) {
  const blockers = card.blockedBy.filter((b) => b.status !== 'Done').map((b) => b.key);

  return (
    <button
      className={styles.tile}
      data-key={card.key}
      data-blocked={blockers.length > 0 ? 'true' : undefined}
      data-highlighted={highlighted ? 'true' : undefined}
      onClick={() => {
        onSelect(card.key);
      }}
    >
      <span className={styles.key}>{card.key}</span>
      <span>{card.summary}</span>
      <span className={styles.meta}>
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
}
