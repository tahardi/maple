import { useEffect, useId } from 'react';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h2 id={titleId}>{title}</h2>
        <p>{body}</p>
        <div className={styles.buttons}>
          <button onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
