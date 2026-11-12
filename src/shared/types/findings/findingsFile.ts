import type { Finding } from './finding';

export type FindingsFile = {
  version: 1;
  card: string;
  round: number;
  headSha: string;
  updatedAt: string;
  resume: { round: number; sentAt: string } | null;
  findings: Finding[];
};
