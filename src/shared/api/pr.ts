import type { ChannelKind } from '../ipc';
import type { Fetched, PrInfo, ReviewComment } from '../types';

export type PrApi = {
  get(tabId: string): Promise<Fetched<PrInfo>>;
  approve(tabId: string): Promise<void>;
  comment(tabId: string, path: string, line: number, body: string): Promise<void>;
  comments(tabId: string): Promise<ReviewComment[]>;
};

export const PR_CHANNELS = {
  get: 'invoke',
  approve: 'invoke',
  comment: 'invoke',
  comments: 'invoke',
} as const satisfies { [M in keyof PrApi]: ChannelKind };
