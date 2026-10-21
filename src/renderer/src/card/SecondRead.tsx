import type { Finding } from '@shared/types';
import { useState } from 'react';
import styles from './SecondRead.module.css';

type Props = {
  tabId: string;
  findings: readonly Finding[];
  onOpen: (path: string) => void;
  onRemove: (finding: Finding) => void;
};

export function SecondRead({ tabId, findings, onOpen, onRemove }: Props) {
  const [posting, setPosting] = useState<Finding | null>(null);
  const [failed, setFailed] = useState<{ finding: Finding; message: string } | null>(null);

  const post = (finding: Finding) => {
    setPosting(finding);
    setFailed(null);
    window.maple.pr.comment(tabId, finding.path, finding.line, finding.text).then(
      () => {
        setPosting(null);
        onRemove(finding);
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setFailed({ finding, message: message.replace(/^Error invoking remote method '[^']+': Error: /, '') });
        setPosting(null);
      },
    );
  };

  return (
    <section className={styles.findings} aria-label="Second read">
      <h4>Second read</h4>
      {findings.length === 0 && <p className={styles.none}>No findings</p>}
      <ul className={styles.list}>
        {findings.map((finding) => (
          <li key={`${finding.path}:${String(finding.line)}:${finding.text}`} className={styles.finding}>
            <div className={styles.place}>{`${finding.path}:${String(finding.line)}`}</div>
            <div>{finding.text}</div>
            {failed?.finding === finding && (
              <div className={styles.error} role="alert">
                {failed.message}
              </div>
            )}
            <div className={styles.actions}>
              <button
                onClick={() => {
                  onOpen(finding.path);
                }}
              >
                Open
              </button>
              <button
                disabled={posting === finding}
                onClick={() => {
                  post(finding);
                }}
              >
                Post
              </button>
              <button
                onClick={() => {
                  onRemove(finding);
                }}
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
