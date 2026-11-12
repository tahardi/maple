export const IMPACT_CHIPS = [
  'costs-money',
  'leaks-credentials',
  'leaks-data',
  'runs-code',
  'changes-data',
  'bypasses-access',
  'breaks-service',
  'supply-chain',
] as const;

export type ImpactChip = (typeof IMPACT_CHIPS)[number];
