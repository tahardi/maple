import { useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '../../shell/useDismiss';
import { useMenuKeys } from '../../shell/useMenuKeys';
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

  useDismiss(menu, true, onDismiss);
  const onKeyDown = useMenuKeys(menu, true);

  const left = Math.max(0, Math.min(x, window.innerWidth - size.width));
  const top = Math.max(0, Math.min(y, window.innerHeight - size.height));

  return (
    <div ref={menu} role="menu" className={styles.menu} style={{ left, top }} onKeyDown={onKeyDown}>
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
