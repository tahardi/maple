import type { ReactNode } from 'react';
import { Button } from '../shell/blocks/Button';
import styles from './ActionBar.module.css';
import type { PaneAction } from './ClaudePane';

type ActionBarProps = { actions: readonly PaneAction[]; children?: ReactNode };

export function ActionBar({ actions, children }: ActionBarProps) {
  return (
    <div className={styles.bar}>
      {actions.map((a) => (
        <Button
          key={a.label}
          label={a.label}
          onClick={a.onClick}
          disabled={a.disabled}
          reason={a.reason}
          fix={a.fix}
          busy={a.busy}
          busyLabel={a.busyLabel}
          variant={a.variant}
        />
      ))}
      {children}
    </div>
  );
}
