import { useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import { useMenuKeys } from '@renderer/shell/menu/useMenuKeys';
import styles from './NoteMenu.module.css';

type Props = {
  x: number;
  y: number;
  unsaved: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onCopyPath: () => void;
  onOpenInObsidian: () => void;
  onTrash: () => void;
  onDismiss: () => void;
};

export function NoteMenu({
  x,
  y,
  unsaved,
  onRename,
  onDuplicate,
  onCopyPath,
  onOpenInObsidian,
  onTrash,
  onDismiss,
}: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (box !== undefined) {
      setSize({ width: box.width, height: box.height });
    }
  }, []);

  useDismiss(menu, true, onDismiss);
  const onKeyDown = useMenuKeys(menu, true);

  const left = Math.max(0, Math.min(x, window.innerWidth - size.width));
  const top = Math.max(0, Math.min(y, window.innerHeight - size.height));
  const reason = unsaved && <span className={styles.reason}>Save or discard your edits first</span>;

  return (
    <div ref={menu} role="menu" className={styles.menu} style={{ left, top }} onKeyDown={onKeyDown}>
      <button role="menuitem" disabled={unsaved} aria-keyshortcuts="F2" onClick={onRename}>
        <span className={styles.label}>
          Rename
          <kbd aria-hidden>F2</kbd>
        </span>
        {reason}
      </button>
      <button role="menuitem" onClick={onDuplicate}>
        Duplicate
      </button>
      <button role="menuitem" onClick={onCopyPath}>
        Copy path
      </button>
      <button role="menuitem" onClick={onOpenInObsidian}>
        Open in Obsidian
      </button>
      <hr className={styles.divider} />
      <button role="menuitem" className={styles.danger} disabled={unsaved} aria-keyshortcuts="Delete" onClick={onTrash}>
        <span className={styles.label}>
          Move to trash
          <kbd aria-hidden>Del</kbd>
        </span>
        {reason}
      </button>
    </div>
  );
}
