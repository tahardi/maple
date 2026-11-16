import type { FindingDecision } from './findingDecision';

export type Recommendation = { decision: FindingDecision['kind']; why: string };
