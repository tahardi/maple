import { useState } from 'react';
import type { TreeNode } from './buildTree';
import styles from './FileTree.module.css';

type Props = {
  nodes: readonly TreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
  changedOnly: boolean;
  onToggle: (changedOnly: boolean) => void;
  changedCount: number;
  viewed?: ReadonlySet<string>;
  onToggleViewed?: (path: string) => void;
  commented?: ReadonlySet<string>;
  collapsedByDefault?: boolean;
};

export function FileTree({
  nodes,
  selected,
  onSelect,
  changedOnly,
  onToggle,
  changedCount,
  viewed,
  onToggleViewed,
  commented,
  collapsedByDefault = false,
}: Props) {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const collapsed = (path: string) => collapsedByDefault !== flipped.has(path);

  const flip = (path: string) => {
    setFlipped((dirs) => {
      const next = new Set(dirs);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  };

  const rows = (list: readonly TreeNode[], depth: number): React.ReactNode[] =>
    list.flatMap((node) => [
      <li
        key={node.path}
        className={node.path === selected ? `${styles.row} ${styles.selected}` : styles.row}
        style={{ paddingLeft: 8 + depth * 12 }}
        aria-expanded={node.dir ? !collapsed(node.path) : undefined}
        onClick={() => {
          if (node.dir) {
            flip(node.path);
          } else {
            onSelect(node.path);
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
                onChange={() => {
                  onToggleViewed(node.path);
                }}
              />
            )}
          </span>
        )}
      </li>,
      ...(collapsed(node.path) ? [] : rows(node.children, depth + 1)),
    ]);

  return (
    <div className={styles.tree}>
      <div className={styles.toggle}>
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
      <ul className={styles.list}>{rows(nodes, 0)}</ul>
    </div>
  );
}
