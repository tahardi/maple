import type { ChannelKind } from '../ipc';
import type { DiffLines, FilePair } from '../types/files';
import type { Fetched } from '../types/app';
import type { PrInfo, Review, ReviewComment } from '../types/github';

export type PrApi = {
  get(tabId: string): Promise<Fetched<PrInfo>>;
  approve(tabId: string, headSha: string): Promise<void>;
  review(tabId: string): Promise<Fetched<Review>>;
  readFile(tabId: string, path: string, oldPath: string | null, baseSha: string, headSha: string): Promise<FilePair>;
  comment(tabId: string, path: string, startLine: number | null, line: number, body: string): Promise<void>;
  reply(tabId: string, commentId: number, body: string): Promise<void>;
  resolve(tabId: string, threadId: string, resolved: boolean): Promise<void>;
  comments(tabId: string): Promise<ReviewComment[]>;
  diffLines(tabId: string): Promise<DiffLines>;
};

export const PR_CHANNELS = {
  get: 'invoke',
  approve: 'invoke',
  review: 'invoke',
  readFile: 'invoke',
  comment: 'invoke',
  reply: 'invoke',
  resolve: 'invoke',
  comments: 'invoke',
  diffLines: 'invoke',
} as const satisfies { [M in keyof PrApi]: ChannelKind };
