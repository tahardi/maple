import styles from './VaultSwitch.module.css';

export const VAULT_PREFIX = 'vault:';

export type TreeView = 'worktree' | 'vault';

type Props = {
  view: TreeView;
  onChange: (view: TreeView) => void;
  onRefresh: () => void;
};

export function VaultSwitch({ view, onChange, onRefresh }: Props) {
  return (
    <div className={styles.switch}>
      <button
        aria-pressed={view === 'worktree'}
        onClick={() => {
          onChange('worktree');
        }}
      >
        Worktree
      </button>
      <button
        aria-pressed={view === 'vault'}
        onClick={() => {
          onChange('vault');
        }}
      >
        Vault
      </button>
      {view === 'vault' && (
        <button className={styles.refresh} onClick={onRefresh}>
          Refresh
        </button>
      )}
    </div>
  );
}
