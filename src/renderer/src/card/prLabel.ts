import type { PrInfo } from '@shared/types/github';
import { prRepo } from '@shared/prRepo';

export function prLabel(info: PrInfo, projectRepo: string | null): string {
  const repo = prRepo(info.url);
  const number = `PR #${String(info.number)}`;
  return projectRepo === null || repo === projectRepo ? number : `${repo} ${number}`;
}
