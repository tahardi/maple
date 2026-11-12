import type { Finding } from '@shared/types/findings/finding';

export function effectiveSeverity(finding: Finding): 'high' | 'medium' | 'low' {
  return finding.severityOverride ?? finding.severity;
}
