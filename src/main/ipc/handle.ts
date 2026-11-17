import { ipcMain } from 'electron';
import type { z } from 'zod';
import type { ApiMethod } from '@shared/api/apiMethod';
import type { IpcArea, MethodOf } from '@shared/api/mapleApi';
import { recordAction } from './recordActions';

export type Handler<A extends IpcArea, M extends MethodOf<A, 'invoke'>> = (
  ...args: Parameters<ApiMethod<A, M>>
) => ReturnType<ApiMethod<A, M>> | Awaited<ReturnType<ApiMethod<A, M>>>;

export function handle<A extends IpcArea, M extends MethodOf<A, 'invoke'>>(
  area: A,
  method: M,
  args: z.ZodType<Parameters<ApiMethod<A, M>>>,
  run: Handler<A, M>,
): void {
  const channel = `${area}:${method}`;
  ipcMain.handle(channel, (_event, ...raw: unknown[]) => {
    const parsed = args.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`handling ${channel}: arguments are invalid`);
    }
    recordAction(channel, parsed.data);
    return run(...parsed.data);
  });
}
