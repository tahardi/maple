import { isDeepStrictEqual } from 'node:util';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { StoredDecision } from './storedDecision';

export function trustDecisions(file: FindingsFile, stored: readonly StoredDecision[]): FindingsFile {
  return {
    ...file,
    findings: file.findings.map((finding) => {
      const record = stored.find((r) => r.id === finding.id && isDeepStrictEqual(r.identity, finding.identity));
      return { ...finding, decision: record?.decision ?? null, severityOverride: record?.severityOverride ?? null };
    }),
  };
}
