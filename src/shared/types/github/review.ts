import type { FileChange } from '../files/fileChange';

export type Review = {
  number: number;
  headSha: string;
  baseSha: string;
  added: number;
  removed: number;
  files: FileChange[];
};
