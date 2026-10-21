import type { ReviewComment } from '@shared/types';

export type CommentMark = { line: number; preview: string; hover: string };

const PREVIEW_LENGTH = 60;

function preview(thread: readonly ReviewComment[]): string {
  const first = thread[0];
  const text = first.body.split('\n')[0] ?? '';
  const cut = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
  const more = thread.length > 1 ? ` (+${String(thread.length - 1)})` : '';
  return `  💬 ${first.author}: ${cut}${more}`;
}

export function toCommentMarks(comments: readonly ReviewComment[], path: string): CommentMark[] {
  const byLine = new Map<number, ReviewComment[]>();
  for (const c of comments.filter((c) => c.path === path)) {
    byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
  }
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, thread]) => ({
      line,
      preview: preview(thread),
      hover: thread.map((c) => `**${c.author}**: ${c.body}`).join('\n\n---\n\n'),
    }));
}
