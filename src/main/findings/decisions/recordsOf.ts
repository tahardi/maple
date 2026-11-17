import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { findingFingerprint } from './findingFingerprint';
import type { StoredDecision } from './storedDecision';

export function recordsOf(file: FindingsFile): StoredDecision[] {
  return file.findings
    .filter((f) => f.decision !== null || f.severityOverride !== null)
    .map((f) => ({
      id: f.id,
      identity: f.identity,
      decision: f.decision,
      severityOverride: f.severityOverride,
      fingerprint: findingFingerprint(f),
      handedOver: f.handedOver ?? false,
    }));
}
