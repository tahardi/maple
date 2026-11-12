import type { IpcArea, MapleApi } from './mapleApi';

export type ApiMethod<A extends IpcArea, M extends keyof MapleApi[A]> = Extract<
  MapleApi[A][M],
  (...args: never) => unknown
>;
