import type { ChannelKind } from './mapleApi';
import type { CloseResult } from '../types/tabs/closeResult';
import type { SessionCost } from '../types/tabs/sessionCost';
import type { TabState } from '../types/tabs/tabState';
import type { TabStatus } from '../types/tabs/tabStatus';
import type { Unsubscribe } from '../types/app/unsubscribe';
import type { QueueState } from '../types/queue/queueState';

export type TabsApi = {
  list(): Promise<TabState[]>;
  startCard(projectKey: string, cardKey: string): Promise<TabState | null>;
  openCard(projectKey: string, cardKey: string): Promise<TabState>;
  openPlanner(projectKey: string): Promise<TabState>;
  openVault(projectKey: string): Promise<TabState>;
  openLearning(projectKey: string): Promise<TabState>;
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
  moveQueued(cardKey: string, index: number): Promise<void>;
  onQueue(cb: (state: QueueState) => void): Unsubscribe;
};

export const TABS_CHANNELS = {
  list: 'invoke',
  startCard: 'invoke',
  openCard: 'invoke',
  openPlanner: 'invoke',
  openVault: 'invoke',
  openLearning: 'invoke',
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
