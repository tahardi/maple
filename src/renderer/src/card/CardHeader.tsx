import type { Card } from '@shared/types/jira';
import type { ChangeSet } from '@shared/types/files';
import type { PrInfo } from '@shared/types/github';
import type { SessionCost } from '@shared/types/tabs';
import styles from './CardHeader.module.css';

type Props = {
  cardKey: string;
  card: Card | null;
  pr: PrInfo | null;
  branch: string | null;
  changes: Pick<ChangeSet, 'files' | 'added' | 'removed'> | null;
  cost: SessionCost | null;
  onOpenCard: () => void;
};

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

function costLabel(cost: SessionCost): string {
  const tokens = cost.inputTokens + cost.outputTokens + cost.cacheWriteTokens + cost.cacheReadTokens;
  const label = `${compact.format(tokens)} tokens`;
  return cost.dollars === null ? label : `${label} · $${cost.dollars.toFixed(2)}`;
}

export function CardHeader({ cardKey, card, pr, branch, changes, cost, onOpenCard }: Props) {
  return (
    <header className={styles.header}>
      {card ? (
        <button className={styles.title} title="Open card description" onClick={onOpenCard}>
          {`${cardKey} ${card.summary}`}
        </button>
      ) : (
        <span className={styles.title}>{cardKey}</span>
      )}
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
      {cost && <span>{costLabel(cost)}</span>}
    </header>
  );
}
