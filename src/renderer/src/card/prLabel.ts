import type { PrInfo } from '@shared/types/github/prInfo';
import { prRepo } from '@shared/github/prRepo';

export function prLabel(info: PrInfo, projectRepo: string | null): string {
  const repo = prRepo(info.url);
  const number = `PR #${String(info.number)}`;
  return projectRepo === null || repo === projectRepo ? number : `${repo} ${number}`;
}
