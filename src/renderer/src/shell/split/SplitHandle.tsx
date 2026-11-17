import styles from './SplitHandle.module.css';
import type { ColumnDrag } from './useColumnDrag';

type Props = { drag: ColumnDrag; axis: 'x' | 'y'; label: string };

export function SplitHandle({ drag, axis, label }: Props) {
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      className={styles.handle}
      onPointerDown={drag.start}
      onDoubleClick={drag.reset}
    >
      <span className={styles.grip} />
    </div>
  );
}
