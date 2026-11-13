import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { Severity } from '@shared/types/findings/severity';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import { FindingCard } from './FindingCard';
import styles from './FindingsView.module.css';

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function rank(finding: Finding): number {
  return (finding.decision === null ? 0 : 3) + ORDER[effectiveSeverity(finding)];
}

type FindingsViewProps = { tabId: string; file: FindingsFile | null; error: string | null };

export function FindingsView({ tabId, file, error }: FindingsViewProps) {
  const working = useMaple((s) => tabId in s.statuses && s.statuses[tabId].dot === 'working');
  const applying = file !== null && file.resume?.round === file.round;
  const findings = [...(file?.findings ?? [])].sort((a, b) => rank(a) - rank(b));
  return (
    <div className={styles.view}>
      {error !== null ? (
        <Notice tone="danger">{error}</Notice>
      ) : findings.length === 0 ? (
        <p className={styles.empty}>No findings</p>
      ) : (
        findings.map((finding) => (
          <FindingCard key={finding.id} tabId={tabId} finding={finding} working={working} applying={applying} />
        ))
      )}
    </div>
  );
}
