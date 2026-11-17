export type FileStatus = 'A' | 'M' | 'D' | 'R';

export type FileChange = { path: string; status: FileStatus; oldPath: string | null; stamp: string | null };
