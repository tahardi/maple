import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
