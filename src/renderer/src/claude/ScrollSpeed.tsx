import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../shell/useDismiss';
import styles from './ScrollSpeed.module.css';
import { isWheelLines } from './useWheelLines';

type ScrollSpeedProps = { value: number; onChange: (lines: number) => void; onClose: () => void };

export function ScrollSpeed({ value, onChange, onClose }: ScrollSpeedProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    if (root.current?.contains(document.activeElement)) {
      onClose();
    }
  }, [onClose]);
  useDismiss(root, open, close);
  return (
    <div ref={root} className={styles.settings}>
      <button
        aria-label="Pane settings"
        title="Pane settings"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
      >
        ⚙
      </button>
      {open && (
        <div className={styles.panel}>
          <label className={styles.speed}>
            Scroll speed{' '}
            <input
              type="number"
              min={1}
              max={20}
              defaultValue={value}
              onChange={(e) => {
                const lines = e.target.value === '' ? NaN : Number(e.target.value);
                if (isWheelLines(lines)) {
                  onChange(lines);
                }
              }}
            />
          </label>
          <span className={styles.hint}>lines per notch</span>
        </div>
      )}
    </div>
  );
}
