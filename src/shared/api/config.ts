import type { ChannelKind } from '../ipc';
import type { Fetched, MapleConfig, Unsubscribe } from '../types';

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
