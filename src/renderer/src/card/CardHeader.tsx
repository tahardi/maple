import type { Card, ChangeSet, PrInfo } from '@shared/types';
import styles from './CardHeader.module.css';

type Props = {
  cardKey: string;
  card: Card | null;
  pr: PrInfo | null;
  branch: string | null;
  changes: ChangeSet | null;
};

export function CardHeader({ cardKey, card, pr, branch, changes }: Props) {
  return (
    <header className={styles.header}>
      <span className={styles.title}>{card ? `${cardKey} ${card.summary}` : cardKey}</span>
      {card && <span className={styles.pill}>{card.status}</span>}
      {pr && (
        <a href={pr.url} target="_blank" rel="noreferrer">
          {`#${String(pr.number)} ↗`}
        </a>
      )}
      {branch !== null && <span className={styles.branch}>{branch}</span>}
      {changes && (
        <span>{`${String(changes.files.length)} files · +${String(changes.added)} −${String(changes.removed)}`}</span>
      )}
    </header>
  );
}
