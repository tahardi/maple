import type { CheckRun, ChecksSummary, Fetched, PrInfo } from '@shared/types';
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

export function PrSummary({ pr, onOpenDescription }: { pr: Fetched<PrInfo>; onOpenDescription: () => void }) {
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
