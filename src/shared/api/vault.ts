import type { ChannelKind } from '../ipc';
import type { VaultNote } from '../types';

export type VaultApi = {
  list(): Promise<VaultNote[]>;
  read(path: string): Promise<string>;
  written(tabId: string): Promise<string[]>;
};

export const VAULT_CHANNELS = {
  list: 'invoke',
  read: 'invoke',
  written: 'invoke',
} as const satisfies { [M in keyof VaultApi]: ChannelKind };
