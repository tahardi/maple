import { useEffect, useRef } from 'react';
import styles from './FileTabMenu.module.css';

type Props = {
  x: number;
  y: number;
  only: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onDismiss: () => void;
};

export function FileTabMenu({ x, y, only, onClose, onCloseOthers, onCloseAll, onDismiss }: Props) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !menu.current?.contains(e.target)) {
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onDismiss]);

  return (
    <div ref={menu} role="menu" className={styles.menu} style={{ left: x, top: y }}>
      <button role="menuitem" onClick={onClose}>
        Close
      </button>
      <button role="menuitem" disabled={only} onClick={onCloseOthers}>
        Close Others
      </button>
      <button role="menuitem" onClick={onCloseAll}>
        Close All
      </button>
    </div>
  );
}
