import type { ChannelKind } from './mapleApi';
import type { Unsubscribe } from '../types/app';
import type { VaultNote } from '../types/files';

export type VaultApi = {
  list(): Promise<VaultNote[]>;
  read(path: string): Promise<string>;
  written(tabId: string): Promise<string[]>;
  before(tabId: string, path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  onChanged(cb: () => void): Unsubscribe;
};

export const VAULT_CHANNELS = {
  list: 'invoke',
  read: 'invoke',
  written: 'invoke',
  before: 'invoke',
  write: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof VaultApi]: ChannelKind };
