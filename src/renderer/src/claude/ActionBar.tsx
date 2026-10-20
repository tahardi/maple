import type { ReactNode } from 'react';
import styles from './ActionBar.module.css';
import type { PaneAction } from './ClaudePane';

type ActionBarProps = { actions: readonly PaneAction[]; children?: ReactNode };

export function ActionBar({ actions, children }: ActionBarProps) {
  return (
    <div className={styles.bar}>
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title}>
          {a.label}
        </button>
      ))}
      {children}
    </div>
  );
}
