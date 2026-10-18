import type { TreeNode } from './buildTree';
import styles from './FileTree.module.css';

type Props = {
  nodes: readonly TreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
  changedOnly: boolean;
  onToggle: (changedOnly: boolean) => void;
  changedCount: number;
};

export function FileTree({ nodes, selected, onSelect, changedOnly, onToggle, changedCount }: Props) {
  const rows = (list: readonly TreeNode[], depth: number): React.ReactNode[] =>
    list.flatMap((node) => [
      <li
        key={node.path}
        className={node.path === selected ? `${styles.row} ${styles.selected}` : styles.row}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={
          node.dir
            ? undefined
            : () => {
                onSelect(node.path);
              }
        }
      >
        <span className={node.dir ? styles.dir : undefined}>{node.name}</span>
        {node.status && <span className={`${styles.badge} ${styles[node.status]}`}>{node.status}</span>}
      </li>,
      ...rows(node.children, depth + 1),
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
