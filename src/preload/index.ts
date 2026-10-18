import { IPC_CHANNELS, type ChannelKind, type MapleApi } from '@shared/ipc';
import type { Unsubscribe } from '@shared/types';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function eventChannel(area: string, method: string, keys: unknown[]): string {
  const event = method.charAt(2).toLowerCase() + method.slice(3);
  return [area, event, ...keys.map(String)].join(':');
}

function subscribe(channel: string, cb: (payload: unknown) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: unknown) => {
    cb(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

function buildMethod(area: string, method: string, kind: ChannelKind) {
  const channel = `${area}:${method}`;
  switch (kind) {
    case 'invoke':
      return (...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args);
    case 'send':
      return (...args: unknown[]): void => {
        ipcRenderer.send(channel, ...args);
      };
    case 'event':
      return (...args: unknown[]): Unsubscribe => {
        const cb = args.at(-1) as (payload: unknown) => void;
        return subscribe(eventChannel(area, method, args.slice(0, -1)), cb);
      };
  }
}

const maple = Object.fromEntries(
  Object.entries(IPC_CHANNELS).map(([area, methods]) => [
    area,
    Object.fromEntries(
      Object.entries(methods).map(([method, kind]: [string, ChannelKind]) => [method, buildMethod(area, method, kind)]),
    ),
  ]),
) as unknown as MapleApi;

contextBridge.exposeInMainWorld('maple', maple);
