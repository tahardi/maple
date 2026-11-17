import type { Finding } from '@shared/types/findings/finding';

export function awaitingHandover(finding: Finding): boolean {
  return finding.decision !== null && finding.handedOver !== true && finding.applied === null;
}
