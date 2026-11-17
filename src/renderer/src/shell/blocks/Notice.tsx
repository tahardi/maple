import type { ReactNode } from 'react';
import { Button } from './Button';
import type { Tone } from './tone';
import styles from './Notice.module.css';

export function Notice({ tone, children, onDismiss }: { tone: Tone; children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className={styles.notice} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
      {onDismiss !== undefined && <Button label="Dismiss" onClick={onDismiss} />}
    </div>
  );
}
