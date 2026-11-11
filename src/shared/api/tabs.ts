import type { ChannelKind } from '../ipc';
import type { CloseResult, SessionCost, TabState, TabStatus } from '../types/tabs';
import type { Unsubscribe } from '../types/app';
import type { QueueState } from '../types/queue';

export type TabsApi = {
  list(): Promise<TabState[]>;
  startCard(projectKey: string, cardKey: string): Promise<TabState | null>;
  openCard(projectKey: string, cardKey: string): Promise<TabState>;
  openPlanner(projectKey: string): Promise<TabState>;
  openVault(projectKey: string): Promise<TabState>;
  close(tabId: string, force: boolean): Promise<CloseResult>;
  resume(tabId: string): Promise<void>;
  startFresh(tabId: string): Promise<void>;
  selectWorktree(tabId: string, path: string): Promise<void>;
  setActive(tabId: string | null): void;
  statuses(): Promise<TabStatus[]>;
  cost(tabId: string): Promise<SessionCost | null>;
  onStatus(cb: (s: TabStatus) => void): Unsubscribe;
  onChanged(cb: (tabs: TabState[]) => void): Unsubscribe;
  onActivate(cb: (tabId: string) => void): Unsubscribe;
  startQueue(): Promise<QueueState>;
  unqueue(cardKey: string): Promise<void>;
  moveQueued(cardKey: string, offset: -1 | 1): Promise<void>;
  onQueue(cb: (state: QueueState) => void): Unsubscribe;
};

export const TABS_CHANNELS = {
  list: 'invoke',
  startCard: 'invoke',
  openCard: 'invoke',
  openPlanner: 'invoke',
  openVault: 'invoke',
  close: 'invoke',
  resume: 'invoke',
  startFresh: 'invoke',
  selectWorktree: 'invoke',
  setActive: 'send',
  statuses: 'invoke',
  cost: 'invoke',
  onStatus: 'event',
  onChanged: 'event',
  onActivate: 'event',
  startQueue: 'invoke',
  unqueue: 'invoke',
  moveQueued: 'invoke',
  onQueue: 'event',
} as const satisfies { [M in keyof TabsApi]: ChannelKind };
