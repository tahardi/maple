import { Dialog } from './blocks/Dialog';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p>{body}</p>
      <div className={styles.buttons}>
        <button onClick={onCancel} data-autofocus>
          Cancel
        </button>
        <button onClick={onConfirm} data-variant={danger === true ? 'danger' : 'primary'}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
