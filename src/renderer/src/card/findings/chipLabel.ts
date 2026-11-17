import type { ImpactChip } from '@shared/types/findings/impactChip';

const LABELS: Record<ImpactChip, string> = {
  'costs-money': 'could cost money',
  'leaks-credentials': 'could leak credentials',
  'leaks-data': 'could leak private data',
  'runs-code': 'could run attacker code',
  'changes-data': 'could change or delete data',
  'bypasses-access': 'could skip a permission check',
  'breaks-service': 'could take the app down',
  'supply-chain': 'could sneak in bad code',
};

export function chipLabel(chip: ImpactChip): string {
  return LABELS[chip];
}
