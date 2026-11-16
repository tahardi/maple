import type { FileThreads } from './threadsByFile';

export function threadCount(groups: readonly FileThreads[]): number {
  return groups.reduce((n, g) => n + g.threads.length, 0);
}
