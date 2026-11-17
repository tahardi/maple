import { isDeepStrictEqual } from 'node:util';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { findingFingerprint } from './findingFingerprint';
import type { StoredDecision } from './storedDecision';

export function trustDecisions(file: FindingsFile, stored: readonly StoredDecision[]): FindingsFile {
  return {
    ...file,
    findings: file.findings.map((finding) => {
      const fingerprint = findingFingerprint(finding);
      const record = stored.find(
        (r) => r.id === finding.id && isDeepStrictEqual(r.identity, finding.identity) && r.fingerprint === fingerprint,
      );
      return { ...finding, decision: record?.decision ?? null, severityOverride: record?.severityOverride ?? null };
    }),
  };
}
