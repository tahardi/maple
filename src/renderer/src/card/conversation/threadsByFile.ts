import type { ReviewComment } from '@shared/types/github/reviewComment';
import { toThreads, type Thread } from '@renderer/card/comments/commentThreads';

export type FileThreads = { path: string; threads: Thread[] };

export function threadsByFile(comments: readonly ReviewComment[]): { open: FileThreads[]; resolved: FileThreads[] } {
  const paths = [...new Set(comments.map((c) => c.path))].sort((a, b) => a.localeCompare(b));
  const open: FileThreads[] = [];
  const resolved: FileThreads[] = [];
  for (const path of paths) {
    const threads = toThreads(comments, path);
    const openThreads = threads.filter((t) => !t.resolved);
    const resolvedThreads = threads.filter((t) => t.resolved);
    if (openThreads.length > 0) {
      open.push({ path, threads: openThreads });
    }
    if (resolvedThreads.length > 0) {
      resolved.push({ path, threads: resolvedThreads });
    }
  }
  return { open, resolved };
}
