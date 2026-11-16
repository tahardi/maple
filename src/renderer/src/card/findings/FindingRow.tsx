import type { Finding } from '@shared/types/findings/finding';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Badge } from '@renderer/shell/blocks/Badge';
import { DECISION_LABELS } from './decisionLabels';
import { SEVERITY_TONES } from './severityTones';
import styles from './FindingsView.module.css';

function note(finding: Finding): string | null {
  if (finding.decision !== null) {
    return DECISION_LABELS[finding.decision.kind];
  }
  return finding.recommend ? `Recommended: ${DECISION_LABELS[finding.recommend.decision]}` : null;
}

type FindingRowProps = { finding: Finding; onOpen: () => void };

export function FindingRow({ finding, onOpen }: FindingRowProps) {
  const severity = effectiveSeverity(finding);
  const text = note(finding);
  return (
    <button type="button" className={styles.row} data-decided={finding.decision !== null} onClick={onOpen}>
      <Badge tone={SEVERITY_TONES[severity]}>{severity}</Badge>
      <span className={styles.rowTitle}>{finding.title}</span>
      {text !== null && <span className={styles.rowNote}>{text}</span>}
    </button>
  );
}
