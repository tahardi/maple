import type { ChannelKind } from '../ipc';
import type { DiffLines, Fetched, PrInfo, ReviewComment } from '../types';

export type PrApi = {
  get(tabId: string): Promise<Fetched<PrInfo>>;
  approve(tabId: string): Promise<void>;
  comment(tabId: string, path: string, line: number, body: string): Promise<void>;
  comments(tabId: string): Promise<ReviewComment[]>;
  diffLines(tabId: string): Promise<DiffLines>;
  dropImpact(tabId: string, item: string): Promise<void>;
};

export const PR_CHANNELS = {
  get: 'invoke',
  approve: 'invoke',
  comment: 'invoke',
  comments: 'invoke',
  diffLines: 'invoke',
  dropImpact: 'invoke',
} as const satisfies { [M in keyof PrApi]: ChannelKind };
