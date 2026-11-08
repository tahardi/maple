import type { ChannelKind } from '../ipc';
import type { Unsubscribe } from '../types/app';
import type { Dot } from '../types/tabs';

export type AppApi = {
  setNotifications(on: boolean): Promise<void>;
  warnings(): Promise<string[]>;
  setLastProject(key: string): Promise<void>;
  lastProject(): Promise<string | null>;
  setSeen(seen: Record<string, Dot>): Promise<void>;
  seen(): Promise<Record<string, Dot>>;
  onQuitRequested(cb: (workingCardKeys: string[]) => void): Unsubscribe;
  confirmQuit(): void;
};

export const APP_CHANNELS = {
  setNotifications: 'invoke',
  warnings: 'invoke',
  setLastProject: 'invoke',
  lastProject: 'invoke',
  setSeen: 'invoke',
  seen: 'invoke',
  onQuitRequested: 'event',
  confirmQuit: 'send',
} as const satisfies { [M in keyof AppApi]: ChannelKind };
