import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@renderer/shell/blocks/Button';
import styles from './LessonPage.module.css';

type LessonStep = { name: string; pages: number; body: (page: number | null) => ReactNode };

type Place = { step: number; page: number; label: string };

function places(steps: readonly LessonStep[]): Place[] {
  return steps.flatMap(({ name, pages }, step) =>
    Array.from({ length: pages }, (_, page) => ({
      step,
      page,
      label: pages === 1 ? name : `${name} (${String(page + 1)} of ${String(pages)})`,
    })),
  );
}

export function LessonSteps({ steps, onePage }: { steps: readonly LessonStep[]; onePage: boolean }) {
  const [at, setAt] = useState(0);
  const all = places(steps);
  const index = Math.min(at, all.length - 1);
  const here = all[index];
  const next = all.at(index + 1);
  return (
    <div className={styles.steps}>
      {!onePage && (
        <div className={styles.progress}>
          <progress value={index + 1} max={all.length} aria-label="Lesson progress" />
          <span className={styles.stepCount}>
            Step {here.step + 1} of {steps.length}
          </span>
        </div>
      )}
      {steps.map((step, n) => (
        <section key={step.name} className={styles.step} hidden={!onePage && n !== here.step}>
          <h2>{step.name}</h2>
          {step.body(onePage ? null : n === here.step ? here.page : 0)}
        </section>
      ))}
      {!onePage && (
        <nav aria-label="Lesson steps" className={styles.stepNav}>
          {index > 0 && (
            <Button
              label="Back"
              onClick={() => {
                setAt(index - 1);
              }}
            />
          )}
          {next !== undefined && (
            <Button
              label={`Next: ${next.label}`}
              variant="primary"
              onClick={() => {
                setAt(index + 1);
              }}
            />
          )}
        </nav>
      )}
    </div>
  );
}
