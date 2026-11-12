export type ReviewComment = {
  id: number;
  replyTo: number | null;
  startLine: number | null;
  path: string;
  line: number;
  author: string;
  body: string;
  threadId: string | null;
  resolved: boolean;
};
