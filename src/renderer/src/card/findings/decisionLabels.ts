import type { FindingDecision } from '@shared/types/findings/findingDecision';

export const DECISION_LABELS: Record<FindingDecision['kind'], string> = {
  'fix-now': 'Fix now',
  'fix-later': 'Fix later',
  'accept-risk': 'Accept risk',
  'not-real': 'Not real',
};
