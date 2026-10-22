import { impactItems } from '@shared/prBody';
import type { ChecksSummary, Fetched, PrInfo } from '@shared/types';
import { useState } from 'react';
import { MarkdownText } from '../shell/MarkdownText';
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

export function PrSummary({
  tabId,
  pr,
  onOpenDescription,
}: {
  tabId: string;
  pr: Fetched<PrInfo>;
  onOpenDescription: () => void;
}) {
  const info = pr.data;
  const [dropped, setDropped] = useState<{ body: string; items: readonly string[] }>({ body: '', items: [] });
  const [dropError, setDropError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const hidden = info !== null && dropped.body === info.body ? dropped.items : [];
  const impacts = info?.state === 'OPEN' ? impactItems(info.cardImpacts).filter((item) => !hidden.includes(item)) : [];

  const drop = (body: string, item: string) => {
    setDropError(null);
    setDropping(true);
    window.maple.pr
      .dropImpact(tabId, item)
      .then(
        () => {
          setDropped((d) => ({ body, items: d.body === body ? [...d.items, item] : [item] }));
        },
        (err: unknown) => {
          setDropError(err instanceof Error ? err.message : String(err));
        },
      )
      .finally(() => {
        setDropping(false);
      });
  };
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
          {sections.map((s) => (
            <div key={s.title}>
              <h4>{s.title}</h4>
              {s.title === 'Card impacts' && impacts.length > 0 ? (
                impacts.map((item) => (
                  <div key={item} className={styles.impact}>
                    <MarkdownText text={item} />
                    <button
                      className={styles.drop}
                      disabled={dropping}
                      onClick={() => {
                        drop(info.body, item);
                      }}
                    >
                      Drop
                    </button>
                  </div>
                ))
              ) : s.text === null || (s.title === 'Card impacts' && hidden.length > 0) ? (
                <p className={styles.none}>None</p>
              ) : (
                <MarkdownText text={s.text} />
              )}
            </div>
          ))}
          {dropError !== null && (
            <div className={styles.error} role="alert">
              {dropError}
            </div>
          )}
        </>
      )}
    </section>
  );
}
