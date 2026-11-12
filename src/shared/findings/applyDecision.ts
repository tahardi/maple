import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { DecisionInput } from '@shared/types/findings/decisionInput';
import type { Severity } from '@shared/types/findings/severity';

function update(file: FindingsFile, id: string, doing: string, change: (f: Finding) => Finding): FindingsFile {
  const target = file.findings.find((f) => f.id === id);
  if (target === undefined) {
    throw new Error(`${doing}: no finding ${id} on ${file.card}`);
  }
  if (target.applied !== null) {
    throw new Error(`${doing}: ${id} is already applied`);
  }
  return { ...file, findings: file.findings.map((f) => (f === target ? change(f) : f)) };
}

export function applyDecision(
  file: FindingsFile,
  id: string,
  decision: DecisionInput | null,
  now: string,
): FindingsFile {
  if (decision?.kind === 'accept-risk' && (decision.reason ?? '').trim() === '') {
    throw new Error('deciding finding: accept risk needs a reason');
  }
  return update(file, id, 'deciding finding', (f) => ({
    ...f,
    decision: decision === null ? null : { ...decision, decidedAt: now },
  }));
}

export function applyOverride(file: FindingsFile, id: string, severity: Severity | null): FindingsFile {
  return update(file, id, 'overriding severity', (f) => ({ ...f, severityOverride: severity }));
}
