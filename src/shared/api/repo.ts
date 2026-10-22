import type { ChannelKind } from '../ipc';
import type { ChangeSet, FilePair, SearchHit } from '../types/files';
import type { Unsubscribe } from '../types/app';

export type RepoApi = {
  changes(tabId: string): Promise<ChangeSet | null>;
  listFiles(tabId: string): Promise<string[]>;
  readFile(tabId: string, path: string): Promise<FilePair>;
  writeFile(tabId: string, path: string, text: string): Promise<void>;
  search(tabId: string, query: string): Promise<SearchHit[]>;
  onChanged(tabId: string, cb: () => void): Unsubscribe;
};

export const REPO_CHANNELS = {
  changes: 'invoke',
  listFiles: 'invoke',
  readFile: 'invoke',
  writeFile: 'invoke',
  search: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof RepoApi]: ChannelKind };
