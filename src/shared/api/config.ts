import type { ChannelKind } from '../ipc';
import type { Fetched, Unsubscribe } from '../types/app';
import type { MapleConfig } from '../types/config';

export type ConfigApi = {
  get(): Promise<Fetched<MapleConfig>>;
  reload(): Promise<Fetched<MapleConfig>>;
  onChanged(cb: (config: Fetched<MapleConfig>) => void): Unsubscribe;
};

export const CONFIG_CHANNELS = {
  get: 'invoke',
  reload: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof ConfigApi]: ChannelKind };
