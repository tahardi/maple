import type { CheckRun, ChecksSummary, PrInfo, SecurityFinding } from '@shared/types/github';
import type { Fetched } from '@shared/types/app';
import { MarkdownText } from '../shell/MarkdownText';
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

type PrSummaryProps = {
  pr: Fetched<PrInfo>;
  onOpenDescription: () => void;
  findings: readonly SecurityFinding[];
  headSha: string | null;
};

export function PrSummary({ pr, onOpenDescription, findings, headSha }: PrSummaryProps) {
  const info = pr.data;
  const sections = info
    ? [
        { title: 'Deviations from the card', text: info.deviations },
        { title: 'Needs Taylor', text: info.needsTaylor },
        { title: 'Card impacts', text: info.cardImpacts },
      ]
    : [];

  return (
    <section className={styles.summary}>
      {pr.error !== null && <div className={styles.error}>GitHub unreachable</div>}
      {info && (
        <>
          <a href={info.url} target="_blank" rel="noreferrer">{`PR #${String(info.number)} ${info.title}`}</a>
          <button className={styles.open} onClick={onOpenDescription}>
            Full description
          </button>
          {headSha !== null && <div className={styles.checks}>{`Reviewing ${headSha.slice(0, 7)}`}</div>}
          <div className={styles.checks}>{checksText(info.checks)}</div>
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
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.summary}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sections.map((s) => (
            <div key={s.title}>
              <h4>{s.title}</h4>
              {s.text === null ? <p className={styles.none}>None</p> : <MarkdownText text={s.text} />}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
