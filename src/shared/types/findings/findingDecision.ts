export type FindingDecision = {
  kind: 'fix-now' | 'fix-later' | 'accept-risk' | 'not-real';
  reason: string | null;
  decidedAt: string;
};
