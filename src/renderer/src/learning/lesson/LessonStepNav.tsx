import { Button } from '@renderer/shell/blocks/Button';
import styles from './LessonPage.module.css';

type LessonStepNavProps = { count: number; at: number; onMove: (at: number) => void };

export function LessonStepNav({ count, at, onMove }: LessonStepNavProps) {
  return (
    <nav aria-label="Lesson steps" className={styles.stepNav}>
      <Button
        label="Back"
        disabled={at === 0}
        onClick={() => {
          onMove(at - 1);
        }}
      />
      <Button
        label="Next"
        variant="primary"
        disabled={at === count - 1}
        onClick={() => {
          onMove(at + 1);
        }}
      />
    </nav>
  );
}
