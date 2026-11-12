import type { ReactNode } from 'react';
import type { Tone } from './tone';
import styles from './Notice.module.css';

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={styles.notice} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
