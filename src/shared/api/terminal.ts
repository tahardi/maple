import type { ChannelKind } from '../ipc';
import type { Unsubscribe } from '../types';

export type TerminalApi = {
  open(tabId: string): Promise<void>;
  write(tabId: string, data: string): void;
  resize(tabId: string, cols: number, rows: number): void;
  backlog(tabId: string): Promise<string>;
  onData(tabId: string, cb: (data: string) => void): Unsubscribe;
  onExit(tabId: string, cb: (code: number) => void): Unsubscribe;
};

export const TERMINAL_CHANNELS = {
  open: 'invoke',
  write: 'send',
  resize: 'send',
  backlog: 'invoke',
  onData: 'event',
  onExit: 'event',
} as const satisfies { [M in keyof TerminalApi]: ChannelKind };
