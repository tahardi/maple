import type { ReactNode } from 'react';
import type { Tone } from './tone';
import styles from './Badge.module.css';

export function Badge({ tone = 'neutral', children }: { tone?: Tone | 'neutral'; children: ReactNode }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}
