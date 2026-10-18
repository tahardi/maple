import type { ChannelKind } from '../ipc';
import type { Fetched, PrInfo } from '../types';

export type PrApi = {
  get(tabId: string): Promise<Fetched<PrInfo>>;
  approve(tabId: string): Promise<void>;
};

export const PR_CHANNELS = {
  get: 'invoke',
  approve: 'invoke',
} as const satisfies { [M in keyof PrApi]: ChannelKind };
