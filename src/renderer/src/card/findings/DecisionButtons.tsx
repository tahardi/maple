import { useState } from 'react';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingDecision } from '@shared/types/findings/findingDecision';
import type { DecisionInput } from '@shared/types/findings/decisionInput';
import type { Severity } from '@shared/types/findings/severity';
import { errorText } from '@shared/errors/errorText';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { AcceptRiskDialog } from './AcceptRiskDialog';
import styles from './FindingCard.module.css';

type Kind = FindingDecision['kind'];

const KINDS: readonly (readonly [Kind, string])[] = [
  ['fix-now', 'Fix now'],
  ['fix-later', 'Fix later'],
  ['accept-risk', 'Accept risk'],
  ['not-real', 'Not real'],
];

type DecisionButtonsProps = { tabId: string; finding: Finding; working: boolean; applying: boolean };

function lockReason(finding: Finding, working: boolean, applying: boolean): string | null {
  if (finding.applied !== null) {
    return 'Applied';
  }
  if (working) {
    return 'Claude is working';
  }
  return applying ? 'Claude is applying your decisions' : null;
}

export function DecisionButtons({ tabId, finding, working, applying }: DecisionButtonsProps) {
  const [pending, setPending] = useState<Kind | 'override' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const locked = lockReason(finding, working, applying);
  const chosen = finding.decision?.kind ?? null;

  const run = async (what: Kind | 'override', call: () => Promise<void>): Promise<boolean> => {
    setPending(what);
    setError(null);
    try {
      await call();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setPending(null);
    }
  };

  const decide = (kind: Kind, decision: DecisionInput | null) =>
    run(kind, () => window.maple.findings.decide(tabId, finding.id, decision));

  return (
    <div className={styles.decisions}>
      <div className={styles.buttons}>
        {KINDS.map(([kind, label]) => (
          <Button
            key={kind}
            label={label}
            pressed={chosen === kind}
            disabled={locked !== null || pending !== null}
            busy={pending === kind}
            busyLabel="Saving…"
            onClick={() => {
              if (chosen === kind) {
                void decide(kind, null);
              } else if (kind === 'accept-risk') {
                setError(null);
                setAccepting(true);
              } else {
                void decide(kind, { kind, reason: null });
              }
            }}
          />
        ))}
        <label className={styles.severity}>
          Severity
          <select
            value={finding.severityOverride ?? ''}
            disabled={locked !== null || pending !== null}
            onChange={(e) => {
              const value = e.target.value;
              const severity: Severity | null =
                value === 'high' || value === 'medium' || value === 'low' ? value : null;
              void run('override', () => window.maple.findings.override(tabId, finding.id, severity));
            }}
          >
            <option value="">As reported</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </label>
      </div>
      {locked !== null && <span className={styles.locked}>{locked}</span>}
      {finding.decision?.reason != null && <p className={styles.reason}>{`Reason: ${finding.decision.reason}`}</p>}
      {error !== null && !accepting && <Notice tone="danger">{error}</Notice>}
      {accepting && (
        <AcceptRiskDialog
          busy={pending === 'accept-risk'}
          error={error}
          onConfirm={(reason) => {
            void decide('accept-risk', { kind: 'accept-risk', reason }).then((saved) => {
              if (saved) {
                setAccepting(false);
              }
            });
          }}
          onClose={() => {
            setAccepting(false);
          }}
        />
      )}
    </div>
  );
}
