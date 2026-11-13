import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { undecided } from './undecided';

export function resumeDue(file: FindingsFile | null): boolean {
  if (file === null || undecided(file) > 0 || file.resume?.round === file.round) {
    return false;
  }
  return file.findings.some((finding) => finding.decision !== null && finding.applied === null);
}
