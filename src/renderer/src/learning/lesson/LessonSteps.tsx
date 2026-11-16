import type { LessonPlace, LessonStep } from './lessonPlaces';
import styles from './LessonPage.module.css';

type LessonStepsProps = { steps: readonly LessonStep[]; onePage: boolean; places: readonly LessonPlace[]; at: number };

export function LessonSteps({ steps, onePage, places, at }: LessonStepsProps) {
  const place = places[at];
  const before = places.at(at - 1);
  const next = places.at(at + 1);
  return (
    <div className={styles.steps}>
      {!onePage && (
        <div className={styles.progress}>
          <progress value={place.step + 1} max={steps.length} aria-label="Lesson progress" />
          <span className={styles.stepCount}>
            Step {place.step + 1} of {steps.length}
          </span>
        </div>
      )}
      {steps.map((step, n) => (
        <section key={step.name} className={styles.step} hidden={!onePage && n !== place.step}>
          <h2>{step.name}</h2>
          {step.body(onePage ? null : n === place.step ? place.page : 0)}
        </section>
      ))}
      {!onePage && (
        <div className={styles.around}>
          <span>{at > 0 && before !== undefined && `Back: ${before.label}`}</span>
          <span>{next !== undefined && `Next: ${next.label}`}</span>
        </div>
      )}
    </div>
  );
}
