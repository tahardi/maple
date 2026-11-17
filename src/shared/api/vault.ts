import type { ChannelKind } from './mapleApi';
import type { Unsubscribe } from '../types/app/unsubscribe';
import type { VaultNote } from '../types/files/vaultNote';

export type VaultApi = {
  list(): Promise<VaultNote[]>;
  read(path: string): Promise<string>;
  written(tabId: string): Promise<string[]>;
  before(tabId: string, path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  createNote(path: string): Promise<void>;
  createFolder(path: string): Promise<void>;
  trash(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  duplicate(path: string): Promise<string>;
  openInObsidian(path: string): Promise<void>;
  onChanged(cb: () => void): Unsubscribe;
};

export const VAULT_CHANNELS = {
  list: 'invoke',
  read: 'invoke',
  written: 'invoke',
  before: 'invoke',
  write: 'invoke',
  createNote: 'invoke',
  createFolder: 'invoke',
  trash: 'invoke',
  rename: 'invoke',
  duplicate: 'invoke',
  openInObsidian: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof VaultApi]: ChannelKind };
