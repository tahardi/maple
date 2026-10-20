import type { ChannelKind } from '../ipc';
import type { Unsubscribe, Usage } from '../types';

export type AppApi = {
  setNotifications(on: boolean): Promise<void>;
  warnings(): Promise<string[]>;
  usage(): Promise<Usage | null>;
  onUsage(cb: (u: Usage) => void): Unsubscribe;
  onQuitRequested(cb: (workingCardKeys: string[]) => void): Unsubscribe;
  confirmQuit(): void;
};

export const APP_CHANNELS = {
  setNotifications: 'invoke',
  warnings: 'invoke',
  usage: 'invoke',
  onUsage: 'event',
  onQuitRequested: 'event',
  confirmQuit: 'send',
} as const satisfies { [M in keyof AppApi]: ChannelKind };
