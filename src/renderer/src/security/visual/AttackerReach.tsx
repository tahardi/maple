import { useId } from 'react';
import styles from './AttackerReach.module.css';

type AttackerReachProps = { now: readonly string[]; afterFix: readonly string[] };

export function AttackerReach({ now, afterFix }: AttackerReachProps) {
  const nowId = useId();
  const afterId = useId();
  return (
    <div className={styles.reach}>
      <div className={styles.side} data-side="now">
        <h5 id={nowId} className={styles.heading}>
          An attacker can now
        </h5>
        <ul aria-labelledby={nowId} className={styles.list}>
          {now.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
      <div className={styles.side} data-side="after">
        <h5 id={afterId} className={styles.heading}>
          After the fix
        </h5>
        <ul aria-labelledby={afterId} className={styles.list}>
          {afterFix.length === 0 ? <li>Nothing</li> : afterFix.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}
