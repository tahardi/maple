import type { FindingDecision } from './findingDecision';

export type DecisionInput = Pick<FindingDecision, 'kind' | 'reason'>;
