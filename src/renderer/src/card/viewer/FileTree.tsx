import { useState } from 'react';
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
  title?: string;
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
  title,
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
        onDoubleClick={() => {
          if (!node.dir) {
            onPin?.(node.path);
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
      ...(collapsed(node.path) ? [] : rows(node.children, depth + 1)),
    ]);

  return (
    <div className={styles.tree}>
      {title !== undefined && (
        <div className={styles.title} data-testid="file-tree-title" title={title}>
          {title}
        </div>
      )}
      {onToggle !== undefined && (
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
      )}
      <ul className={styles.list}>{rows(nodes, 0)}</ul>
    </div>
  );
}
