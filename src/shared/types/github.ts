export type ReviewComment = {
  id: number;
  replyTo: number | null;
  startLine: number | null;
  path: string;
  line: number;
  author: string;
  body: string;
  threadId: string | null;
  resolved: boolean;
};
export type CheckRun = { name: string; bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel'; link: string };
export type ChecksSummary = { passed: number; failed: number; pending: number; total: number; runs: CheckRun[] };
export type PrInfo = {
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  deviations: string | null;
  needsTaylor: string | null;
  cardImpacts: string | null;
  body: string;
  checks: ChecksSummary;
};
