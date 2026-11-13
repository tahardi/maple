import type { Finding } from '@shared/types/findings/finding';
import type { Severity } from '@shared/types/findings/severity';
import type { Tone } from '@renderer/shell/blocks/tone';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Badge } from '@renderer/shell/blocks/Badge';
import { chipLabel } from './chipLabel';
import { DecisionButtons } from './DecisionButtons';
import { LearnButtons } from './LearnButtons';
import styles from './FindingCard.module.css';

const SECTIONS = [
  ['What it is', 'what'],
  ['How someone uses it', 'how'],
  ['What it means here', 'impact'],
  ['How to defend', 'defense'],
] as const;

const TONES: Record<Severity, Tone | 'neutral'> = { high: 'danger', medium: 'warning', low: 'neutral' };

function place(finding: Finding): string {
  if (finding.identity.kind === 'dependency') {
    return `${finding.identity.package} ${finding.identity.advisory}`;
  }
  return finding.line === null ? finding.identity.file : `${finding.identity.file}:${String(finding.line)}`;
}

type FindingCardProps = { tabId: string; finding: Finding; working: boolean; applying: boolean };

export function FindingCard({ tabId, finding, working, applying }: FindingCardProps) {
  const severity = effectiveSeverity(finding);
  return (
    <article className={styles.finding}>
      <div className={styles.top}>
        <Badge tone={TONES[severity]}>{severity}</Badge>
        <h3 className={styles.title}>{finding.title}</h3>
      </div>
      {finding.chips.length > 0 && (
        <div className={styles.chips}>
          {finding.chips.map((chip) => (
            <Badge key={chip}>{chipLabel(chip)}</Badge>
          ))}
        </div>
      )}
      <code className={styles.place}>{place(finding)}</code>
      {SECTIONS.map(([label, field]) => (
        <section key={field} className={styles.section}>
          <h4 className={styles.label}>{label}</h4>
          <p className={styles.text}>{finding[field]}</p>
        </section>
      ))}
      <DecisionButtons tabId={tabId} finding={finding} working={working} applying={applying} />
      <LearnButtons tabId={tabId} finding={finding} working={working} />
    </article>
  );
}
