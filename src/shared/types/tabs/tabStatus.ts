import type { Dot } from './dot';

export type SyncState = 'queued' | 'syncing' | null;

export type TabStatus = {
  tabId: string;
  dot: Dot;
  sessionAlive: boolean;
  exitCode: number | null;
  resumeFailed: boolean;
  sync: SyncState;
};
