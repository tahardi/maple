import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@renderer/shell/blocks/Button';
import styles from './LessonPage.module.css';

type LessonStep = { name: string; body: ReactNode };

export function LessonSteps({ steps, onePage }: { steps: readonly LessonStep[]; onePage: boolean }) {
  const [at, setAt] = useState(0);
  const next = steps.at(at + 1);
  return (
    <div className={styles.steps}>
      {!onePage && (
        <div className={styles.progress}>
          <progress value={at + 1} max={steps.length} aria-label="Lesson progress" />
          <span className={styles.stepCount}>
            Step {at + 1} of {steps.length}
          </span>
        </div>
      )}
      {steps.map((step, index) => (
        <section key={step.name} className={styles.step} hidden={!onePage && index !== at}>
          <h2>{step.name}</h2>
          {step.body}
        </section>
      ))}
      {!onePage && (
        <nav aria-label="Lesson steps" className={styles.stepNav}>
          {at > 0 && (
            <Button
              label="Back"
              onClick={() => {
                setAt(at - 1);
              }}
            />
          )}
          {next !== undefined && (
            <Button
              label={`Next: ${next.name}`}
              variant="primary"
              onClick={() => {
                setAt(at + 1);
              }}
            />
          )}
        </nav>
      )}
    </div>
  );
}
