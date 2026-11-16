import type { ChannelKind } from './mapleApi';
import type { Unsubscribe } from '../types/app/unsubscribe';
import type { Dot } from '../types/tabs/dot';
import type { KeptTab } from '../types/tabs/keptTab';

export type AppApi = {
  setNotifications(on: boolean): Promise<void>;
  warnings(): Promise<string[]>;
  setLastProject(key: string): Promise<void>;
  lastProject(): Promise<string | null>;
  setSeen(seen: Record<string, Dot>): Promise<void>;
  seen(): Promise<Record<string, Dot>>;
  kept(): Promise<KeptTab[]>;
  discardKept(tabId: string): Promise<void>;
  onQuitRequested(cb: (workingCardKeys: string[]) => void): Unsubscribe;
  confirmQuit(): void;
  onReportRequested(cb: () => void): Unsubscribe;
  onShortcutsRequested(cb: () => void): Unsubscribe;
};

export const APP_CHANNELS = {
  setNotifications: 'invoke',
  warnings: 'invoke',
  setLastProject: 'invoke',
  lastProject: 'invoke',
  setSeen: 'invoke',
  seen: 'invoke',
  kept: 'invoke',
  discardKept: 'invoke',
  onQuitRequested: 'event',
  confirmQuit: 'send',
  onReportRequested: 'event',
  onShortcutsRequested: 'event',
} as const satisfies { [M in keyof AppApi]: ChannelKind };
