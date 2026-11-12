import type { ChecksSummary } from './checksSummary';

export type PrInfo = {
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  deviations: string | null;
  needsTaylor: string | null;
  cardImpacts: string | null;
  body: string;
  headSha: string;
  checks: ChecksSummary;
};
