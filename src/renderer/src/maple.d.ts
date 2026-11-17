import type { MapleApi } from '@shared/api/mapleApi';

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- augmenting Window requires an interface
  interface Window {
    maple: MapleApi;
  }
}
