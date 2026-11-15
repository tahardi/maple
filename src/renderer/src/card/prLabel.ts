import type { PrInfo } from '@shared/types/github/prInfo';
import { prRepo } from '@shared/github/prRepo';

export function prLabel(info: PrInfo): string {
  const name = prRepo(info.url).split('/')[1] ?? '';
  return `${name} PR #${String(info.number)}`;
}
