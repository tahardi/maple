import { useState } from 'react';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { Severity } from '@shared/types/findings/severity';
import { effectiveSeverity } from '@shared/findings/effectiveSeverity';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import { useLessons } from '@renderer/learning/useLessons';
import { FindingCard } from './FindingCard';
import { FindingRow } from './FindingRow';
import styles from './FindingsView.module.css';

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function rank(finding: Finding): number {
  return (finding.decision === null ? 0 : 3) + ORDER[effectiveSeverity(finding)];
}

type FindingsViewProps = { tabId: string; file: FindingsFile | null; error: string | null };

export function FindingsView({ tabId, file, error }: FindingsViewProps) {
  const working = useMaple((s) => tabId in s.statuses && s.statuses[tabId].dot === 'working');
  const { lessons } = useLessons();
  const [chosen, setChosen] = useState<string | null>(null);
  const applying = file !== null && file.resume?.round === file.round;
  const findings = [...(file?.findings ?? [])].sort((a, b) => rank(a) - rank(b));
  const openId = findings.find((f) => f.id === chosen)?.id ?? findings.find((f) => f.decision === null)?.id ?? null;
  if (error !== null) {
    return (
      <div className={styles.view}>
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }
  return (
    <div className={styles.view}>
      {findings.length === 0 ? (
        <p className={styles.empty}>No findings</p>
      ) : (
        <ol className={styles.list} aria-label="Findings">
          {findings.map((finding) => (
            <li key={finding.id}>
              {finding.id === openId ? (
                <FindingCard tabId={tabId} finding={finding} working={working} applying={applying} lessons={lessons} />
              ) : (
                <FindingRow finding={finding} onOpen={setChosen} />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
