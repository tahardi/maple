import type { CheckRun, ChecksSummary } from '@shared/types/github/checksSummary';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { SecurityFinding } from '@shared/types/github/securityFinding';
import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import { Badge } from '../shell/blocks/Badge';
import { Button } from '../shell/blocks/Button';
import { Notice } from '../shell/blocks/Notice';
import type { Tone } from '../shell/blocks/tone';
import styles from './CiBadge.module.css';

const runSymbols: Record<CheckRun['bucket'], string> = {
  pass: '✓',
  skipping: '–',
  fail: '✗',
  cancel: '✗',
  pending: '●',
};

const runOrder: Record<CheckRun['bucket'], number> = { fail: 0, cancel: 1, pending: 2, pass: 3, skipping: 4 };

function checksText({ passed, failed, pending, total }: ChecksSummary): string {
  if (total === 0) {
    return 'No checks';
  }
  if (failed > 0) {
    return `✗ ${String(failed)} failing`;
  }
  if (pending > 0) {
    return `● ${String(pending)} pending`;
  }
  return `✓ ${String(passed)}/${String(total)}`;
}

function checksTone({ failed, pending, total }: ChecksSummary): Tone | 'neutral' {
  if (total === 0) {
    return 'neutral';
  }
  if (failed > 0) {
    return 'danger';
  }
  return pending > 0 ? 'warning' : 'success';
}

function sortedRuns(runs: readonly CheckRun[]): CheckRun[] {
  return [...runs].sort((a, b) => runOrder[a.bucket] - runOrder[b.bucket]);
}

type Props = {
  pr: PrInfo;
  reviewedSha: string | null;
  updated: boolean;
  reviewError: string | null;
  findings: readonly SecurityFinding[];
  reloading: boolean;
  onReloadReview: () => void;
};

export function CiBadge({ pr, reviewedSha, updated, reviewError, findings, reloading, onReloadReview }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useDismiss(root, open, close);
  const isOpen = pr.state === 'OPEN';

  return (
    <span ref={root} className={styles.ci}>
      <button
        className={styles.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Show CI checks"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Badge tone={checksTone(pr.checks)}>{checksText(pr.checks)}</Badge>
      </button>
      {open && (
        <div role="dialog" aria-label="CI checks" className={styles.popover}>
          <h4>{`Checks on ${pr.headSha.slice(0, 7)}`}</h4>
          {pr.checks.total === 0 && <div className={styles.muted}>No checks ran on this commit.</div>}
          {pr.checks.runs.length > 0 && (
            <ul className={styles.list}>
              {sortedRuns(pr.checks.runs).map((run) => (
                <li key={`${run.name} ${run.link}`}>
                  {runSymbols[run.bucket]}{' '}
                  <a href={run.link} target="_blank" rel="noreferrer">
                    {run.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {reviewedSha !== null &&
            (isOpen && updated ? (
              <Notice tone="warning">{`Updated to ${reviewedSha.slice(0, 7)}`}</Notice>
            ) : (
              <div className={styles.muted}>{`Reviewing ${reviewedSha.slice(0, 7)}`}</div>
            ))}
          {isOpen && <Button label="Reload review" busy={reloading} busyLabel="Reloading…" onClick={onReloadReview} />}
          {reviewError !== null && <Notice tone="danger">{reviewError}</Notice>}
          {findings.length > 0 && (
            <>
              <h4>Security findings</h4>
              <ul className={styles.list}>
                {findings.map((f) => (
                  <li key={f.id}>
                    <span className={f.severity === 'high' ? styles.high : undefined}>{f.severity}</span>{' '}
                    <code>{f.id}</code>{' '}
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.summary === '' ? 'Open comment' : f.summary}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </span>
  );
}
