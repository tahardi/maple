import type { Finding } from '@shared/types/findings/finding';
import type { Severity } from '@shared/types/findings/severity';

export function effectiveSeverity(finding: Finding): Severity {
  return finding.severityOverride ?? finding.severity;
}
