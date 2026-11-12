import type { ChannelKind } from './mapleApi';
import type { Fetched } from '../types/app/fetched';
import type { Unsubscribe } from '../types/app/unsubscribe';
import type { MapleConfig } from '../types/config/mapleConfig';

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
