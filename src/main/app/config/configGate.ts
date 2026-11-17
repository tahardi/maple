import type { MapleConfig } from '@shared/types/config/mapleConfig';

export type ConfigGate = {
  current: () => MapleConfig | null;
  start: () => Promise<void>;
  loaded: (next: MapleConfig | null) => Promise<void>;
};

export function createConfigGate(
  initial: MapleConfig | null,
  onFirstConfig: (config: MapleConfig) => Promise<void>,
  onLaterConfig: (config: MapleConfig) => Promise<void> = () => Promise.resolve(),
): ConfigGate {
  let config = initial;
  let ran = false;
  const runOnce = async (loaded: MapleConfig) => {
    if (ran) {
      return;
    }
    ran = true;
    await onFirstConfig(loaded);
  };
  return {
    current: () => config,
    start: () => (config ? runOnce(config) : Promise.resolve()),
    loaded: async (next) => {
      if (next === null) {
        return;
      }
      config = next;
      if (ran) {
        await onLaterConfig(next);
        return;
      }
      await runOnce(next);
    },
  };
}
