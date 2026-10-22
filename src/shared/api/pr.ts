import type { ChannelKind } from '../ipc';
import type { DiffLines, Fetched, PrInfo, ReviewComment } from '../types';

export type PrApi = {
  get(tabId: string): Promise<Fetched<PrInfo>>;
  approve(tabId: string): Promise<void>;
  comment(tabId: string, path: string, line: number, body: string): Promise<void>;
  reply(tabId: string, commentId: number, body: string): Promise<void>;
  comments(tabId: string): Promise<ReviewComment[]>;
  diffLines(tabId: string): Promise<DiffLines>;
};

export const PR_CHANNELS = {
  get: 'invoke',
  approve: 'invoke',
  comment: 'invoke',
  reply: 'invoke',
  comments: 'invoke',
  diffLines: 'invoke',
} as const satisfies { [M in keyof PrApi]: ChannelKind };
