import { ipcMain } from 'electron';
import type { z } from 'zod';
import type { ApiMethod } from '@shared/api/apiMethod';
import type { IpcArea, MethodOf } from '@shared/api/mapleApi';
import { recordAction } from './recordActions';

export function on<A extends IpcArea, M extends MethodOf<A, 'send'>>(
  area: A,
  method: M,
  args: z.ZodType<Parameters<ApiMethod<A, M>>>,
  run: (...args: Parameters<ApiMethod<A, M>>) => void,
): void {
  const channel = `${area}:${method}`;
  ipcMain.on(channel, (_event, ...raw: unknown[]) => {
    const parsed = args.safeParse(raw);
    if (parsed.success) {
      recordAction(channel, parsed.data);
      run(...parsed.data);
    }
  });
}
