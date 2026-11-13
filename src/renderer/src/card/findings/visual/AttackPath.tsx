import { Fragment } from 'react';
import type { AttackStep } from '@shared/types/findings/findingVisual';
import styles from './AttackPath.module.css';

export function AttackPath({ steps }: { steps: readonly AttackStep[] }) {
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
