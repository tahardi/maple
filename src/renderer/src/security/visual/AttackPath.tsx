import { Fragment } from 'react';
import type { AttackStep } from '@shared/types/findings/findingVisual';
import { StepRow } from './StepRow';
import styles from './AttackPath.module.css';

type Area = { zone: string; steps: AttackStep[] };

function areas(steps: readonly AttackStep[]): Area[] {
  const grouped: Area[] = [];
  for (const step of steps) {
    const last = grouped.at(-1);
    if (last && last.zone === step.zone) {
      last.steps.push(step);
    } else {
      grouped.push({ zone: step.zone ?? '', steps: [step] });
    }
  }
  return grouped;
}

export function AttackPath({ steps }: { steps: readonly AttackStep[] }) {
  if (!steps.every((step) => step.zone)) {
    return <StepRow steps={steps} />;
  }
  return (
    <div className={styles.frame}>
      <div className={styles.zones}>
        {areas(steps).map((area, index) => {
          const label = `${index === 0 ? 'Less trusted' : 'More trusted'} · ${area.zone}`;
          return (
            <Fragment key={index}>
              {index > 0 && (
                <div role="separator" aria-label={area.steps[0]?.crosses} className={styles.wall}>
                  <span aria-hidden="true">→</span>
                  {area.steps[0]?.crosses && <span>{area.steps[0].crosses}</span>}
                </div>
              )}
              <section aria-label={label} className={styles.area} data-trust={index === 0 ? 'less' : 'more'}>
                <span className={styles.zone}>{label}</span>
                <StepRow steps={area.steps} />
              </section>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
