import { useState } from 'react';
import { errorText } from '@shared/errors/errorText';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import styles from './ApplyDecisionsButton.module.css';

export function ApplyDecisionsButton({ tabId }: { tabId: string }) {
  const alive = useMaple((s) => tabId in s.statuses && s.statuses[tabId].sessionAlive);
  const working = useMaple((s) => tabId in s.statuses && s.statuses[tabId].dot === 'working');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = !alive ? 'The session is not running' : working ? 'Claude is working' : null;

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await window.maple.findings.apply(tabId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.apply}>
      <Button
        label="Apply decisions"
        variant="primary"
        disabled={reason !== null}
        busy={busy}
        busyLabel="Sending…"
        reason={reason}
        onClick={() => {
          void apply();
        }}
      />
      {error !== null && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
