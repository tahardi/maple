import { useState } from 'react';
import { Button } from '../shell/blocks/Button';
import styles from './SessionEnded.module.css';

type SessionEndedProps = { tabId: string; exitCode: number | null; resumeFailed: boolean };

export function SessionEnded({ tabId, exitCode, resumeFailed }: SessionEndedProps) {
  const [pending, setPending] = useState<'resume' | 'fresh' | null>(null);

  const run = (kind: 'resume' | 'fresh', request: Promise<unknown>) => {
    setPending(kind);
    void request.finally(() => {
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
    </div>
  );
}
