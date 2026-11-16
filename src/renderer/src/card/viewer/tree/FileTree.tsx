import { useState, type ReactNode } from 'react';
import type { TreeNode } from './buildTree';
import styles from './FileTree.module.css';

type Props = {
  nodes: readonly TreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
  onPin?: (path: string) => void;
  changedOnly?: boolean;
  onToggle?: (changedOnly: boolean) => void;
  changedCount?: number;
  viewed?: ReadonlySet<string>;
  onToggleViewed?: (path: string) => void;
  commented?: ReadonlySet<string>;
  collapsedByDefault?: boolean;
  onSelectFolder?: (path: string) => void;
  onFileMenu?: (path: string, x: number, y: number) => void;
  nameBox?: { folder: string; box: ReactNode };
  targetFolder?: string;
};

export function FileTree({
  nodes,
  selected,
  onSelect,
  onPin,
  changedOnly,
  onToggle,
  changedCount,
  viewed,
  onToggleViewed,
  commented,
  collapsedByDefault = false,
  onSelectFolder,
  onFileMenu,
  nameBox,
  targetFolder,
}: Props) {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const holdsNameBox = (path: string) =>
    nameBox !== undefined && (nameBox.folder === path || nameBox.folder.startsWith(`${path}/`));
  const collapsed = (path: string) => !holdsNameBox(path) && collapsedByDefault !== flipped.has(path);
  const boxRow = (folder: string, depth: number) =>
    nameBox?.folder === folder
      ? [
          <li key={`${folder}/\0name-box`} className={styles.row} style={{ paddingLeft: 8 + depth * 12 }}>
            {nameBox.box}
          </li>,
        ]
      : [];

  const flip = (path: string) => {
    setFlipped((dirs) => {
      const next = new Set(dirs);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  };

  const rows = (list: readonly TreeNode[], depth: number): ReactNode[] =>
    list.flatMap((node) => [
      <li
        key={node.path}
        className={[
          styles.row,
          node.path === selected ? styles.selected : '',
          node.dir && node.path === targetFolder ? styles.target : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-current={node.dir && node.path === targetFolder ? 'location' : undefined}
        style={{ paddingLeft: 8 + depth * 12 }}
        aria-expanded={node.dir ? !collapsed(node.path) : undefined}
        onClick={() => {
          if (node.dir) {
            flip(node.path);
            onSelectFolder?.(node.path);
          } else {
            onSelect(node.path);
          }
        }}
        onDoubleClick={() => {
          if (!node.dir) {
            onPin?.(node.path);
          }
        }}
        onContextMenu={(e) => {
          if (!node.dir && onFileMenu !== undefined) {
            e.preventDefault();
            onFileMenu(node.path, e.clientX, e.clientY);
          }
        }}
      >
        <span className={node.dir ? styles.dir : undefined}>{node.name}</span>
        {commented?.has(node.path) && (
          <span className={styles.commented} role="img" aria-label="Has review comments" title="Has review comments">
            💬
          </span>
        )}
        {node.status && (
          <span className={styles.marks}>
            <span className={`${styles.badge} ${styles[node.status]}`}>{node.status}</span>
            {onToggleViewed && (
              <input
                type="checkbox"
                aria-label={`Viewed ${node.path}`}
                checked={viewed?.has(node.path) ?? false}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                }}
                onChange={() => {
                  onToggleViewed(node.path);
                }}
              />
            )}
          </span>
        )}
      </li>,
      ...(collapsed(node.path) ? [] : [...boxRow(node.path, depth + 1), ...rows(node.children, depth + 1)]),
    ]);

  return (
    <div className={styles.tree}>
      {onToggle !== undefined && (
        <div className={styles.toggle}>
          <div role="group" aria-label="Files shown" data-variant="segmented">
            <button
              aria-pressed={!changedOnly}
              onClick={() => {
                onToggle(false);
              }}
            >
              All files
            </button>
            <button
              aria-pressed={changedOnly}
              onClick={() => {
                onToggle(true);
              }}
            >
              {`Changed (${String(changedCount)})`}
            </button>
          </div>
        </div>
      )}
      <ul className={styles.list}>{[...boxRow('', 0), ...rows(nodes, 0)]}</ul>
    </div>
  );
}
