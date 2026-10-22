import styles from './MergedNotice.module.css';

export function MergedNotice({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className={styles.notice}>
      <span>{label}</span>
      <button onClick={onClose}>Close tab</button>
    </div>
  );
}
