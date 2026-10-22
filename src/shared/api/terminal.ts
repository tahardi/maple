import type { ChannelKind } from '../ipc';
import type { Unsubscribe } from '../types/app';

export type TerminalApi = {
  open(tabId: string, terminalId: string): Promise<void>;
  close(terminalId: string): Promise<void>;
  write(terminalId: string, data: string): void;
  resize(terminalId: string, cols: number, rows: number): void;
  backlog(terminalId: string): Promise<string>;
  onData(terminalId: string, cb: (data: string) => void): Unsubscribe;
  onExit(terminalId: string, cb: (code: number) => void): Unsubscribe;
};

export const TERMINAL_CHANNELS = {
  open: 'invoke',
  close: 'invoke',
  write: 'send',
  resize: 'send',
  backlog: 'invoke',
  onData: 'event',
  onExit: 'event',
} as const satisfies { [M in keyof TerminalApi]: ChannelKind };
