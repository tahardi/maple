import type { CheckRun, ChecksSummary } from '@shared/types/github/checksSummary';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { SecurityFinding } from '@shared/types/github/securityFinding';
import type { Fetched } from '@shared/types/app/fetched';
import { prLabel } from './prLabel';
import styles from './PrSummary.module.css';

const runSymbols: Record<CheckRun['bucket'], string> = {
  pass: '✓',
  skipping: '–',
  fail: '✗',
  cancel: '✗',
  pending: '●',
};

function checksText({ passed, failed, pending, total }: ChecksSummary): string {
  if (failed > 0) {
    return `✗ ${String(failed)} failing`;
  }
  if (pending > 0) {
    return `● ${String(pending)} pending`;
  }
  return `✓ ${String(passed)}/${String(total)}`;
}

const stateLabels: Record<PrInfo['state'], string> = { OPEN: 'Open', MERGED: 'Merged', CLOSED: 'Closed' };

function stateLabel(state: PrInfo['state']): string {
  return stateLabels[state];
}

type PrSummaryProps = {
  pr: Fetched<PrInfo>;
  onOpenDescription: () => void;
  onReloadReview: () => void;
  reviewError: string | null;
  findings: readonly SecurityFinding[];
  projectRepo: string | null;
  headSha: string | null;
  updated: boolean;
  searchedRepos: readonly string[];
};

export function PrSummary({
  pr,
  onOpenDescription,
  onReloadReview,
  reviewError,
  findings,
  projectRepo,
  headSha,
  updated,
  searchedRepos,
}: PrSummaryProps) {
  const info = pr.data;
  return (
    <section className={styles.summary}>
      {pr.error !== null && <div className={styles.error}>GitHub unreachable</div>}
      {info === null && pr.error === null && pr.fetchedAt !== null && searchedRepos.length > 0 && (
        <div className={styles.muted}>
          {`No PR found in ${searchedRepos.join(', ')}. ` +
            'If it is in another repo, add that repo to otherRepos in config.json, then choose File > Reload config.'}
        </div>
      )}
      {info && (
        <>
          <div className={styles.row}>
            <button className={styles.number} title="Open PR description" onClick={onOpenDescription}>
              {prLabel(info, projectRepo)}
            </button>
            <span className={styles.state} data-state={info.state}>
              {stateLabel(info.state)}
            </span>
          </div>
          <div className={styles.title}>{info.title}</div>
          {info.state === 'OPEN' && updated && headSha !== null && (
            <div className={styles.banner} role="status">{`Updated to ${headSha.slice(0, 7)}`}</div>
          )}
          {(headSha !== null || info.state === 'OPEN') && (
            <div className={styles.row}>
              {headSha !== null && <span className={styles.muted}>{`Reviewing ${headSha.slice(0, 7)}`}</span>}
              {info.state === 'OPEN' && <button onClick={onReloadReview}>Reload review</button>}
            </div>
          )}
          {reviewError !== null && <div className={styles.error}>{reviewError}</div>}
          <h4>Checks</h4>
          <div>{checksText(info.checks)}</div>
          {info.checks.runs.length > 0 && (
            <ul className={styles.runs}>
              {info.checks.runs.map((run) => (
                <li key={`${run.name} ${run.link}`}>
                  {runSymbols[run.bucket]}{' '}
                  <a href={run.link} target="_blank" rel="noreferrer">
                    {run.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {findings.length > 0 && (
            <div>
              <h4>Security findings</h4>
              <ul className={styles.runs}>
                {findings.map((f) => (
                  <li key={f.id}>
                    <span className={f.severity === 'high' ? styles.error : undefined}>{f.severity}</span>{' '}
                    <code>{f.id}</code>{' '}
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.summary === '' ? 'Open comment' : f.summary}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
