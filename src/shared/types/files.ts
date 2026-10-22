export type FileStatus = 'A' | 'M' | 'D' | 'R';
export type VaultNote = { path: string; modifiedAt: string };
export type FileChange = { path: string; status: FileStatus; oldPath: string | null; stamp: string | null };
export type SearchHit = { path: string; line: number; text: string };
export type ChangeSet = { base: string; files: FileChange[]; added: number; removed: number };
export type FilePair =
  | { kind: 'text'; path: string; current: string | null; base: string | null }
  | { kind: 'binary'; path: string }
  | { kind: 'tooLarge'; path: string; bytes: number };
export type DiffLines = { ranges: Record<string, readonly [number, number][]>; unpushed: string[] };
export type Draft = { text: string; disk: string | null };
export type LineMark =
  | { kind: 'add'; line: number }
  | { kind: 'chg'; line: number; oldText: string | null }
  | { kind: 'del'; afterLine: number; oldText: string };
