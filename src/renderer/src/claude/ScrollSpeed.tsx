import styles from './ScrollSpeed.module.css';
import { isWheelLines } from './useWheelLines';

type ScrollSpeedProps = { value: number; onChange: (lines: number) => void };

export function ScrollSpeed({ value, onChange }: ScrollSpeedProps) {
  return (
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
  );
}
