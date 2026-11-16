import type { LessonPlace } from './lessonPlaces';
import { Button } from '@renderer/shell/blocks/Button';
import styles from './LessonPage.module.css';

type LessonStepNavProps = { places: readonly LessonPlace[]; at: number; onMove: (at: number) => void };

export function LessonStepNav({ places, at, onMove }: LessonStepNavProps) {
  const next = places.at(at + 1);
  return (
    <nav aria-label="Lesson steps" className={styles.stepNav}>
      <span style={at === 0 ? { visibility: 'hidden' } : undefined}>
        <Button
          label="Back"
          onClick={() => {
            onMove(at - 1);
          }}
        />
      </span>
      {next !== undefined && (
        <Button
          label={`Next: ${next.label}`}
          variant="primary"
          onClick={() => {
            onMove(at + 1);
          }}
        />
      )}
    </nav>
  );
}
