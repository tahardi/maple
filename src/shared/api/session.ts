import type { ChannelKind } from '../ipc';
import type { Unsubscribe } from '../types';

export type SessionApi = {
  write(tabId: string, data: string): void;
  resize(tabId: string, cols: number, rows: number): void;
  sendPrompt(tabId: string, text: string): void;
  backlog(tabId: string): Promise<string>;
  onData(tabId: string, cb: (data: string) => void): Unsubscribe;
  onBatch(projectKey: string, cb: (keys: string[]) => void): Unsubscribe;
};

export const SESSION_CHANNELS = {
  write: 'send',
  resize: 'send',
  sendPrompt: 'send',
  backlog: 'invoke',
  onData: 'event',
  onBatch: 'event',
} as const satisfies { [M in keyof SessionApi]: ChannelKind };
