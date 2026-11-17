import type { FileChange } from './fileChange';

export type ChangeSet = { base: string; files: FileChange[]; added: number; removed: number };
