import type { ChannelKind } from '../ipc';
import type { Fetched, MapleConfig } from '../types';

export type ConfigApi = {
  get(): Promise<Fetched<MapleConfig>>;
  reload(): Promise<Fetched<MapleConfig>>;
};

export const CONFIG_CHANNELS = {
  get: 'invoke',
  reload: 'invoke',
} as const satisfies { [M in keyof ConfigApi]: ChannelKind };
