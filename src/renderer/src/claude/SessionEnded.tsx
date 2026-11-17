import { useState } from 'react';
import { errorText } from '@shared/errors/errorText';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './SessionEnded.module.css';

type SessionEndedProps = { tabId: string; exitCode: number | null; resumeFailed: boolean };

export function SessionEnded({ tabId, exitCode, resumeFailed }: SessionEndedProps) {
  const [pending, setPending] = useState<'resume' | 'fresh' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (kind: 'resume' | 'fresh', request: Promise<unknown>) => {
    setPending(kind);
    setError(null);
    request
      .catch((err: unknown) => {
        setError(errorText(err));
      })
      .finally(() => {
        setPending(null);
      });
  };

  return (
    <div className={styles.overlay}>
      <p>
        {resumeFailed ? 'Resume failed' : 'Session ended'} (exit code {exitCode ?? 'unknown'})
      </p>
      <div className={styles.buttons}>
        <Button
          label="Resume"
          variant="primary"
          disabled={pending !== null}
          busy={pending === 'resume'}
          busyLabel="Resuming…"
          onClick={() => {
            run('resume', window.maple.tabs.resume(tabId));
          }}
        />
        <Button
          label="Start fresh"
          disabled={pending !== null}
          busy={pending === 'fresh'}
          busyLabel="Starting…"
          onClick={() => {
            run('fresh', window.maple.tabs.startFresh(tabId));
          }}
        />
      </div>
      {error !== null && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
