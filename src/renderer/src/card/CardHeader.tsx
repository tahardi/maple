import type { Card } from '@shared/types/jira/card';
import type { ChangeSet } from '@shared/types/files/changeSet';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import { prLabel } from './prLabel';
import styles from './CardHeader.module.css';

type Props = {
  cardKey: string;
  card: Card | null;
  pr: PrInfo | null;
  branch: string | null;
  changes: Pick<ChangeSet, 'files' | 'added' | 'removed'> | null;
  cost: SessionCost | null;
  projectRepo: string | null;
  onOpenCard: () => void;
};

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

function costLabel(cost: SessionCost): string {
  const tokens = cost.inputTokens + cost.outputTokens + cost.cacheWriteTokens + cost.cacheReadTokens;
  const label = `${compact.format(tokens)} tokens`;
  return cost.dollars === null ? label : `${label} · $${cost.dollars.toFixed(2)}`;
}

function costBreakdown(cost: SessionCost): string {
  return [
    `Input ${compact.format(cost.inputTokens)}`,
    `Output ${compact.format(cost.outputTokens)}`,
    `Cache write ${compact.format(cost.cacheWriteTokens)}`,
    `Cache read ${compact.format(cost.cacheReadTokens)}`,
  ].join(' · ');
}

export function CardHeader({ cardKey, card, pr, branch, changes, cost, projectRepo, onOpenCard }: Props) {
  return (
    <header className={styles.header}>
      {card ? (
        <button
          className={styles.title}
          title={`${cardKey} ${card.summary}\nClick to open the card description`}
          onClick={onOpenCard}
        >
          {`${cardKey} ${card.summary}`}
        </button>
      ) : (
        <span className={styles.title}>{cardKey}</span>
      )}
      {card && <span className={styles.pill}>{card.status}</span>}
      {pr && (
        <a href={pr.url} target="_blank" rel="noreferrer" title="Open on GitHub">
          {`${prLabel(pr, projectRepo)} ↗`}
        </a>
      )}
      {branch !== null && (
        <span className={styles.branch} title={branch}>
          {branch}
        </span>
      )}
      {changes && (
        <span className={styles.changes}>
          {`${String(changes.files.length)} ${changes.files.length === 1 ? 'file' : 'files'}`}
          <span className={styles.added}>{`+${String(changes.added)}`}</span>
          <span className={styles.removed}>{`−${String(changes.removed)}`}</span>
        </span>
      )}
      {cost && (
        <span className={styles.cost} title={costBreakdown(cost)}>
          {costLabel(cost)}
        </span>
      )}
    </header>
  );
}
