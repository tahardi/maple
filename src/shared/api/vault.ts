import type { ChannelKind } from '../ipc';
import type { Unsubscribe } from '../types/app';
import type { VaultNote } from '../types/files';

export type VaultApi = {
  list(): Promise<VaultNote[]>;
  read(path: string): Promise<string>;
  written(tabId: string): Promise<string[]>;
  write(path: string, text: string): Promise<void>;
  onChanged(cb: () => void): Unsubscribe;
};

export const VAULT_CHANNELS = {
  list: 'invoke',
  read: 'invoke',
  written: 'invoke',
  write: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof VaultApi]: ChannelKind };
