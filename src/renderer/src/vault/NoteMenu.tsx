import { useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import { useMenuKeys } from '@renderer/shell/menu/useMenuKeys';
import styles from './NoteMenu.module.css';

type Props = { x: number; y: number; unsaved: boolean; onTrash: () => void; onDismiss: () => void };

export function NoteMenu({ x, y, unsaved, onTrash, onDismiss }: Props) {
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

  return (
    <div ref={menu} role="menu" className={styles.menu} style={{ left, top }} onKeyDown={onKeyDown}>
      <button role="menuitem" className={styles.danger} disabled={unsaved} onClick={onTrash}>
        Move to trash
        {unsaved && <span className={styles.reason}>Save or discard your edits first</span>}
      </button>
    </div>
  );
}
