import type { ChannelKind } from '../ipc';
import type { Unsubscribe } from '../types';

export type AppApi = {
  setNotifications(on: boolean): Promise<void>;
  onQuitRequested(cb: (workingCardKeys: string[]) => void): Unsubscribe;
  confirmQuit(): void;
};

export const APP_CHANNELS = {
  setNotifications: 'invoke',
  onQuitRequested: 'event',
  confirmQuit: 'send',
} as const satisfies { [M in keyof AppApi]: ChannelKind };
