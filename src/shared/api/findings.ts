import type { ChannelKind } from './mapleApi';
import type { Fetched } from '../types/app/fetched';
import type { Unsubscribe } from '../types/app/unsubscribe';
import type { FindingsFile } from '../types/findings/findingsFile';

export type FindingsApi = {
  get(tabId: string): Promise<Fetched<FindingsFile>>;
  onChanged(cb: () => void): Unsubscribe;
};

export const FINDINGS_CHANNELS = {
  get: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof FindingsApi]: ChannelKind };
