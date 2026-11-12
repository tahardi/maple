import type { BrowserWindow } from 'electron';
import { eventChannel } from '@shared/api/eventChannel';
import type { ApiMethod } from '@shared/api/apiMethod';
import type { IpcArea, MethodOf } from '@shared/api/mapleApi';

type Callback = (...args: never) => unknown;

type EmitKeys<A extends IpcArea, M extends MethodOf<A, 'event'>> =
  Parameters<ApiMethod<A, M>> extends [...infer K, Callback] ? K : never;

type EmitPayload<A extends IpcArea, M extends MethodOf<A, 'event'>> =
  Parameters<ApiMethod<A, M>> extends [...unknown[], (...args: infer P extends [] | [unknown]) => unknown] ? P : never;

export type EmitArgs<A extends IpcArea, M extends MethodOf<A, 'event'>> = [...EmitKeys<A, M>, ...EmitPayload<A, M>];

const KEY_COUNTS: { [A in IpcArea]: { [M in MethodOf<A, 'event'>]: EmitKeys<A, M>['length'] } } = {
  config: { onChanged: 0 },
  preflight: {},
  jira: {},
  tabs: { onStatus: 0, onChanged: 0, onActivate: 0, onQueue: 0 },
  session: { onData: 1, onBatch: 1 },
  terminal: { onData: 1, onExit: 1 },
  repo: { onChanged: 1 },
  vault: { onChanged: 0 },
  pr: {},
  findings: { onChanged: 0 },
  app: { onQuitRequested: 0, onReportRequested: 0, onShortcutsRequested: 0 },
};

export function emit<A extends IpcArea, M extends MethodOf<A, 'event'>>(
  win: BrowserWindow | null,
  area: A,
  method: M,
  ...args: EmitArgs<A, M>
): void {
  if (!win || win.isDestroyed()) {
    return;
  }
  const counts: Partial<Record<string, number>> = KEY_COUNTS[area];
  const keyCount = counts[method] ?? 0;
  win.webContents.send(eventChannel(area, method, args.slice(0, keyCount)), ...args.slice(keyCount));
}
