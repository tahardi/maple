import type { ProjectPoints } from '@shared/types';
import styles from './Capacity.module.css';

type Props = { rows: readonly ProjectPoints[]; reviewPoints: number };

export function Capacity({ rows, reviewPoints }: Props) {
  const planned = rows.reduce((sum, row) => sum + row.planned, 0);

  return (
    <div className={styles.capacity}>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.projectKey}>
            <span className={styles.name}>{row.name}</span>
            {` ${String(row.planned)} planned, ${String(row.merged)} merged`}
          </li>
        ))}
      </ul>
      <span className={styles.total} data-over={planned > reviewPoints ? 'true' : undefined}>
        {`${String(planned)} of ${String(reviewPoints)} review points planned`}
      </span>
    </div>
  );
}
