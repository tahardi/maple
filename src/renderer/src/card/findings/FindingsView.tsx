import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Notice } from '@renderer/shell/blocks/Notice';
import { FindingCard } from './FindingCard';
import styles from './FindingsView.module.css';

const ORDER = { high: 0, medium: 1, low: 2 };

function rank(finding: Finding): number {
  return (finding.decision === null ? 0 : 3) + ORDER[effectiveSeverity(finding)];
}

export function FindingsView({ file, error }: { file: FindingsFile | null; error: string | null }) {
  const findings = [...(file?.findings ?? [])].sort((a, b) => rank(a) - rank(b));
  return (
    <div className={styles.view}>
      {error !== null ? (
        <Notice tone="danger">{error}</Notice>
      ) : findings.length === 0 ? (
        <p className={styles.empty}>No findings</p>
      ) : (
        findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)
      )}
    </div>
  );
}
