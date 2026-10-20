import type { ChannelKind } from '../ipc';
import type { CloseResult, SessionCost, TabState, TabStatus, Unsubscribe } from '../types';

export type TabsApi = {
  list(): Promise<TabState[]>;
  startCard(projectKey: string, cardKey: string): Promise<TabState>;
  openCard(projectKey: string, cardKey: string): Promise<TabState>;
  openPlanner(projectKey: string): Promise<TabState>;
  close(tabId: string, force: boolean): Promise<CloseResult>;
  resume(tabId: string): Promise<void>;
  startFresh(tabId: string): Promise<void>;
  setActive(tabId: string | null): void;
  statuses(): Promise<TabStatus[]>;
  cost(tabId: string): Promise<SessionCost | null>;
  onStatus(cb: (s: TabStatus) => void): Unsubscribe;
  onChanged(cb: (tabs: TabState[]) => void): Unsubscribe;
  onActivate(cb: (tabId: string) => void): Unsubscribe;
};

export const TABS_CHANNELS = {
  list: 'invoke',
  startCard: 'invoke',
  openCard: 'invoke',
  openPlanner: 'invoke',
  close: 'invoke',
  resume: 'invoke',
  startFresh: 'invoke',
  setActive: 'send',
  statuses: 'invoke',
  cost: 'invoke',
  onStatus: 'event',
  onChanged: 'event',
  onActivate: 'event',
} as const satisfies { [M in keyof TabsApi]: ChannelKind };
