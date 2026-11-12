import type { FindingsFile } from '@shared/types/findings/findingsFile';

export function undecided(file: FindingsFile | null): number {
  return file?.findings.filter((finding) => finding.decision === null).length ?? 0;
}
