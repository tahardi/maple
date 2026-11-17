import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { Dot } from '@shared/types/tabs/dot';
import { undecided } from '@shared/findings/undecided';

export function findingsLabel(dot: Dot, findings: Fetched<FindingsFile>): string | null {
  if (findings.error !== null) {
    return "Findings can't be read";
  }
  const open = undecided(findings.data);
  if (dot === 'ready' && open > 0) {
    return `${String(open)} ${open === 1 ? 'finding needs' : 'findings need'} you`;
  }
  const total = findings.data?.findings.length ?? 0;
  return total === 0 ? null : `Findings (${String(total)})`;
}
