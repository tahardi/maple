import { Fragment } from 'react';
import type { AttackStep } from '@shared/types/findings/findingVisual';
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

function Row({ steps }: { steps: readonly AttackStep[] }) {
  return (
    <ol className={styles.path}>
      {steps.map((step, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <li aria-hidden="true" className={styles.arrow}>
              →
            </li>
          )}
          <li className={styles.step}>
            <span className={styles.actor}>{step.actor}</span>
            <span>{step.step}</span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

export function AttackPath({ steps }: { steps: readonly AttackStep[] }) {
  if (!steps.every((step) => step.zone)) {
    return <Row steps={steps} />;
  }
  return (
    <div className={styles.frame}>
      <div className={styles.zones}>
        {areas(steps).map((area, index) => {
          const label = `${index === 0 ? 'Less trusted' : 'More trusted'} · ${area.zone}`;
          return (
            <Fragment key={index}>
              {index > 0 && (
                <div role="separator" className={styles.wall}>
                  <span aria-hidden="true">→</span>
                  {area.steps[0]?.crosses && <span>{area.steps[0].crosses}</span>}
                </div>
              )}
              <section aria-label={label} className={styles.area} data-trust={index === 0 ? 'less' : 'more'}>
                <span className={styles.zone}>{label}</span>
                <Row steps={area.steps} />
              </section>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
