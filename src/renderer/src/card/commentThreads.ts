import type { ReviewComment } from '@shared/types';

export type Thread = { id: number; line: number; startLine: number | null; comments: ReviewComment[] };

export function toThreads(comments: readonly ReviewComment[], path: string): Thread[] {
  const inFile = comments.filter((c) => c.path === path);
  const ids = new Set(inFile.map((c) => c.id));
  const isReply = (c: ReviewComment) => c.replyTo !== null && ids.has(c.replyTo);
  const threads = new Map(
    inFile
      .filter((c) => !isReply(c))
      .map((c) => [c.id, { id: c.id, line: c.line, startLine: c.startLine, comments: [c] }]),
  );
  for (const c of inFile) {
    if (c.replyTo !== null && isReply(c)) {
      threads.get(c.replyTo)?.comments.push(c);
    }
  }
  return [...threads.values()].sort((a, b) => a.line - b.line || a.id - b.id);
}
