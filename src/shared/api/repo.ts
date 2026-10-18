import type { ChannelKind } from '../ipc';
import type { ChangeSet, FilePair, Unsubscribe } from '../types';

export type RepoApi = {
  changes(tabId: string): Promise<ChangeSet | null>;
  listFiles(tabId: string): Promise<string[]>;
  readFile(tabId: string, path: string): Promise<FilePair>;
  onChanged(tabId: string, cb: () => void): Unsubscribe;
};

export const REPO_CHANNELS = {
  changes: 'invoke',
  listFiles: 'invoke',
  readFile: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof RepoApi]: ChannelKind };
