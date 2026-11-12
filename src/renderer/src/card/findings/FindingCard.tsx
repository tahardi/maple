import type { Finding } from '@shared/types/findings/finding';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Badge } from '@renderer/shell/blocks/Badge';
import { chipLabel } from './chipLabel';
import styles from './FindingsView.module.css';

const SECTIONS = [
  ['What it is', 'what'],
  ['How someone uses it', 'how'],
  ['What it means here', 'impact'],
  ['How to defend', 'defense'],
] as const;

const TONES = { high: 'danger', medium: 'warning', low: 'neutral' } as const;

function place(finding: Finding): string {
  if (finding.identity.kind === 'dependency') {
    return `${finding.identity.package} ${finding.identity.advisory}`;
  }
  return finding.line === null ? finding.identity.file : `${finding.identity.file}:${String(finding.line)}`;
}

export function FindingCard({ finding }: { finding: Finding }) {
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
    </article>
  );
}
