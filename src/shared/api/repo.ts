import type { ChannelKind } from '../ipc';
import type { ChangeSet, FilePair, Unsubscribe } from '../types';

export type RepoApi = {
  changes(tabId: string): Promise<ChangeSet | null>;
  listFiles(tabId: string): Promise<string[]>;
  readFile(tabId: string, path: string): Promise<FilePair>;
  writeFile(tabId: string, path: string, text: string): Promise<void>;
  onChanged(tabId: string, cb: () => void): Unsubscribe;
};

export const REPO_CHANNELS = {
  changes: 'invoke',
  listFiles: 'invoke',
  readFile: 'invoke',
  writeFile: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof RepoApi]: ChannelKind };
