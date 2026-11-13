import { useState } from 'react';
import { Button } from '@renderer/shell/blocks/Button';
import { Dialog } from '@renderer/shell/blocks/Dialog';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './FindingCard.module.css';

type AcceptRiskDialogProps = {
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

export function AcceptRiskDialog({ busy, error, onConfirm, onClose }: AcceptRiskDialogProps) {
  const [reason, setReason] = useState('');
  const blank = reason.trim() === '';
  return (
    <Dialog title="Accept risk" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason);
        }}
      >
        <label>
          Reason
          <textarea
            value={reason}
            maxLength={500}
            rows={4}
            data-autofocus
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
        </label>
        {error !== null && <Notice tone="danger">{error}</Notice>}
        <div className={styles.dialogButtons}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <Button
            label="Accept risk"
            type="submit"
            variant="danger"
            disabled={blank}
            reason={blank ? 'Type a reason' : null}
            busy={busy}
            busyLabel="Saving…"
          />
        </div>
      </form>
    </Dialog>
  );
}
