import styles from './MergedNotice.module.css';

export function MergedNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.notice}>
      <span>Merged</span>
      <button onClick={onClose}>Close tab</button>
    </div>
  );
}
