import { useState } from 'react';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { Severity } from '@shared/types/findings/severity';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import { useLessons } from '@renderer/learning/useLessons';
import { FindingCard } from './FindingCard';
import { FindingRow } from './FindingRow';
import styles from './FindingsView.module.css';

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function addressed(finding: Finding): boolean {
  return finding.applied !== null && finding.decision !== null;
}

function openKey(finding: Finding): string {
  return `${finding.id}:${finding.applied?.at ?? ''}`;
}

type FindingsViewProps = { tabId: string; file: FindingsFile | null; error: string | null };

export function FindingsView({ tabId, file, error }: FindingsViewProps) {
  const working = useMaple((s) => tabId in s.statuses && s.statuses[tabId].dot === 'working');
  const { lessons } = useLessons();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const applying = file !== null && file.resume?.round === file.round;
  const findings = [...(file?.findings ?? [])].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const isOpen = (finding: Finding): boolean => toggled[openKey(finding)] ?? !addressed(finding);
  const setOpen = (finding: Finding, open: boolean): void => {
    setToggled((current) => ({ ...current, [openKey(finding)]: open }));
  };
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
              {isOpen(finding) ? (
                <FindingCard
                  tabId={tabId}
                  finding={finding}
                  working={working}
                  applying={applying}
                  lessons={lessons}
                  onCollapse={() => {
                    setOpen(finding, false);
                  }}
                />
              ) : (
                <FindingRow
                  finding={finding}
                  onOpen={() => {
                    setOpen(finding, true);
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
