import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { Dot } from '@shared/types/tabs/dot';
import { undecided } from '@shared/findings/undecided';

export function findingsLabel(dot: Dot, file: FindingsFile | null): string | null {
  const open = undecided(file);
  if (dot === 'ready' && open > 0) {
    return `${String(open)} ${open === 1 ? 'finding needs' : 'findings need'} you`;
  }
  const total = file?.findings.length ?? 0;
  return total === 0 ? null : `Findings (${String(total)})`;
}
