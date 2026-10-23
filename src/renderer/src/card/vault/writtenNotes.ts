import type { FileChange, VaultNote } from '@shared/types/files';

export function writtenNotes(notes: readonly VaultNote[], written: readonly string[]): FileChange[] {
  const paths = new Set(written);
  return notes
    .filter((note) => paths.has(note.path))
    .map((note) => ({ path: note.path, status: 'M', oldPath: null, stamp: null }));
}
