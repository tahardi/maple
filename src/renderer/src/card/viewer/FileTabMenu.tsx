import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (box !== undefined) {
      setSize({ width: box.width, height: box.height });
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    const onOutside = (e: Event) => {
      if (e.target instanceof Node && !menu.current?.contains(e.target)) {
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [onDismiss]);

  const left = Math.max(0, Math.min(x, window.innerWidth - size.width));
  const top = Math.max(0, Math.min(y, window.innerHeight - size.height));

  return (
    <div ref={menu} role="menu" className={styles.menu} style={{ left, top }}>
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
