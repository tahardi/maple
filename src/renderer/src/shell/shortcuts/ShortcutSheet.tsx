import { useEffect, useState } from 'react';
import { Dialog } from '@renderer/shell/blocks/Dialog';
import { isTyping } from './isTyping';
import { SHORTCUTS } from './shortcuts';
import styles from './ShortcutSheet.module.css';

export function ShortcutSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey && !isTyping(e.target)) {
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(
    () =>
      window.maple.app.onShortcutsRequested(() => {
        setOpen(true);
      }),
    [],
  );

  if (!open) {
    return null;
  }
  const close = () => {
    setOpen(false);
  };
  return (
    <Dialog title="Keyboard shortcuts" onClose={close}>
      <table className={styles.table}>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys}>
              <td>
                <kbd>{s.keys}</kbd>
              </td>
              <td>{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.buttons}>
        <button onClick={close} data-autofocus>
          Close
        </button>
      </div>
    </Dialog>
  );
}
