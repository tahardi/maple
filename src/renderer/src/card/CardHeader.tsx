import type { ReactNode } from 'react';
import type { Fetched } from '@shared/types/app/fetched';
import type { Card } from '@shared/types/jira/card';
import type { ChangeSet } from '@shared/types/files/changeSet';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import { Badge } from '../shell/blocks/Badge';
import { prLabel } from './prLabel';
import styles from './CardHeader.module.css';

type Props = {
  cardKey: string;
  card: Card | null;
  pr: Fetched<PrInfo> | null;
  searchedRepos: readonly string[];
  ci: ReactNode;
  reviewedSha: string | null;
  reviewUpdated: boolean;
  branch: string | null;
  changes: Pick<ChangeSet, 'files' | 'added' | 'removed'> | null;
  cost: SessionCost | null;
  projectRepo: string | null;
  onOpenCard: () => void;
  onOpenPr: () => void;
};

const NO_PR_HINT =
  'If the PR is in another repo, add that repo to otherRepos in config.json, then choose File > Reload config.';

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

export function CardHeader({
  cardKey,
  card,
  pr,
  searchedRepos,
  ci,
  reviewedSha,
  reviewUpdated,
  branch,
  changes,
  cost,
  projectRepo,
  onOpenCard,
  onOpenPr,
}: Props) {
  const info = pr?.data ?? null;
  const noPr = pr !== null && info === null && pr.error === null && pr.fetchedAt !== null && searchedRepos.length > 0;
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
      {card && <Badge>{card.status}</Badge>}
      {info && (
        <>
          <button className={styles.pr} title="Open PR description" onClick={onOpenPr}>
            {prLabel(info, projectRepo)}
          </button>
          <a href={info.url} target="_blank" rel="noreferrer" title="Open on GitHub">
            ↗
          </a>
          {ci}
          {reviewedSha !== null &&
            (info.state === 'OPEN' && reviewUpdated ? (
              <Badge tone="warning">{`Updated to ${reviewedSha.slice(0, 7)}`}</Badge>
            ) : (
              <span>{`Reviewing ${reviewedSha.slice(0, 7)}`}</span>
            ))}
        </>
      )}
      {pr !== null && pr.error !== null && <Badge tone="danger">GitHub unreachable</Badge>}
      {noPr && <span title={NO_PR_HINT}>{`No PR in ${searchedRepos.join(', ')}`}</span>}
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
