import type { ChannelKind } from './mapleApi';
import type { ChangeSet } from '../types/files/changeSet';
import type { FilePair } from '../types/files/filePair';
import type { RepoInfo } from '../types/files/repoInfo';
import type { SearchHit } from '../types/files/searchHit';
import type { Unsubscribe } from '../types/app/unsubscribe';

export type RepoApi = {
  changes(tabId: string): Promise<ChangeSet | null>;
  listFiles(tabId: string): Promise<string[]>;
  info(tabId: string): Promise<RepoInfo | null>;
  readFile(tabId: string, path: string): Promise<FilePair>;
  writeFile(tabId: string, path: string, text: string): Promise<void>;
  search(tabId: string, query: string): Promise<SearchHit[]>;
  onChanged(tabId: string, cb: () => void): Unsubscribe;
};

export const REPO_CHANNELS = {
  changes: 'invoke',
  listFiles: 'invoke',
  info: 'invoke',
  readFile: 'invoke',
  writeFile: 'invoke',
  search: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof RepoApi]: ChannelKind };
