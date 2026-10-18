import type { ChecksSummary, Fetched, PrInfo } from '@shared/types';
import styles from './PrSummary.module.css';

function checksText({ passed, failed, pending, total }: ChecksSummary): string {
  if (failed > 0) {
    return `✗ ${String(failed)} failing`;
  }
  if (pending > 0) {
    return `● ${String(pending)} pending`;
  }
  return `✓ ${String(passed)}/${String(total)}`;
}

export function PrSummary({ pr }: { pr: Fetched<PrInfo> }) {
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
          <div className={styles.checks}>{checksText(info.checks)}</div>
          {sections.map((s) => (
            <div key={s.title}>
              <h4>{s.title}</h4>
              <pre className={styles.text}>{s.text ?? 'None'}</pre>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
