import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import { useMenuKeys } from '@renderer/shell/menu/useMenuKeys';
import { folderName } from './folderName';
import styles from './WorktreeMenu.module.css';

export function WorktreeMenu({
  label,
  paths,
  selected,
  onSelect,
}: {
  label: string;
  paths: readonly string[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useDismiss(root, open, close);
  const onKeyDown = useMenuKeys(menu, open);

  return (
    <div ref={root} className={styles.worktree}>
      <button
        className={styles.button}
        aria-label={`Repo: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={styles.label}>
          <span className={styles.plain}>{label}</span>
        </span>
        <span className={styles.arrow}>▾</span>
      </button>
      {open && (
        <div ref={menu} role="menu" className={styles.panel} onKeyDown={onKeyDown}>
          {paths.map((path) => (
            <button
              key={path}
              role="menuitemradio"
              aria-checked={path === selected}
              className={styles.row}
              title={path}
              onClick={() => {
                close();
                onSelect(path);
              }}
            >
              {folderName(path)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
