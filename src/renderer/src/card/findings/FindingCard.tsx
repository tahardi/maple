import type { Finding } from '@shared/types/findings/finding';
import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { chipLabel } from './chipLabel';
import { DecisionButtons } from './DecisionButtons';
import { DECISION_LABELS } from './decisionLabels';
import { LearnButtons } from './LearnButtons';
import { SEVERITY_TONES } from './severityTones';
import { AttackPath } from '@renderer/security/visual/AttackPath';
import { AttackerReach } from '@renderer/security/visual/AttackerReach';
import styles from './FindingCard.module.css';

const SECTIONS = [
  ['What it is', 'what'],
  ['How someone uses it', 'how'],
  ['What it means here', 'impact'],
  ['How to defend', 'defense'],
] as const;

function place(finding: Finding): string {
  if (finding.identity.kind === 'dependency') {
    return `${finding.identity.package} ${finding.identity.advisory}`;
  }
  return finding.line === null ? finding.identity.file : `${finding.identity.file}:${String(finding.line)}`;
}

function capitalized(word: string | undefined): string | undefined {
  return word === undefined ? undefined : word.charAt(0).toUpperCase() + word.slice(1);
}

type FindingCardProps = {
  tabId: string;
  finding: Finding;
  working: boolean;
  lessons: readonly LessonSummary[];
  onCollapse: () => void;
};

export function FindingCard({ tabId, finding, working, lessons, onCollapse }: FindingCardProps) {
  const severity = effectiveSeverity(finding);
  const facts = [
    ['Who can do it', finding.attacker],
    ['Likely?', capitalized(finding.likelihood)],
    ['Fix size', capitalized(finding.fixSize)],
    ['Where', place(finding)],
  ].filter((fact): fact is [string, string] => fact[1] !== undefined);
  const recommend = finding.recommend ?? null;
  return (
    <article className={styles.finding}>
      <div className={styles.part}>
        <div className={styles.top}>
          <div className={styles.chips}>
            <Badge tone={SEVERITY_TONES[severity]}>{severity}</Badge>
            {finding.chips.map((chip) => (
              <Badge key={chip}>{chipLabel(chip)}</Badge>
            ))}
          </div>
          <Button label="Collapse" onClick={onCollapse} />
        </div>
        <h3 className={styles.title}>{finding.headline ?? finding.title}</h3>
        <dl className={styles.facts}>
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd data-place={term === 'Where'}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {finding.visual && (
        <div className={styles.part}>
          {finding.visual.path && (
            <section className={styles.section}>
              <h4 className={styles.label}>How the attack goes</h4>
              <AttackPath steps={finding.visual.path} />
            </section>
          )}
          {finding.visual.reach && (
            <section className={styles.section}>
              <h4 className={styles.label}>What an attacker can do</h4>
              <AttackerReach now={finding.visual.reach.now} afterFix={finding.visual.reach.afterFix} />
            </section>
          )}
        </div>
      )}
      <div className={styles.part} data-kind="decide">
        {recommend !== null && (
          <p className={styles.text}>
            <strong>{`Recommended: ${DECISION_LABELS[recommend.decision]}.`}</strong> <span>{recommend.why}</span>
          </p>
        )}
        <DecisionButtons tabId={tabId} finding={finding} working={working} />
        <LearnButtons tabId={tabId} finding={finding} working={working} lessons={lessons} />
      </div>
      <details className={styles.part}>
        <summary className={styles.summary}>Full write-up</summary>
        {SECTIONS.map(([label, field]) => (
          <section key={field} className={styles.section}>
            <h4 className={styles.label}>{label}</h4>
            <p className={styles.text}>{finding[field]}</p>
          </section>
        ))}
      </details>
    </article>
  );
}
