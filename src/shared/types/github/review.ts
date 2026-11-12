import type { FileChange } from '../files/fileChange';
import type { SecurityFinding } from './securityFinding';

export type Review = {
  number: number;
  headSha: string;
  baseSha: string;
  added: number;
  removed: number;
  files: FileChange[];
  findings: SecurityFinding[];
};
