import { ipcMain } from 'electron';
import { z } from 'zod';

export const tabIdArg = z.string().min(1).max(100);
export const projectKeyArg = z.string().regex(/^[A-Z][A-Z0-9]+$/);
export const cardKeyArg = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/);
export const sizeArg = z.number().int().min(1).max(10_000);

export function handle<A extends unknown[]>(channel: string, args: z.ZodType<A>, run: (...args: A) => unknown): void {
  ipcMain.handle(channel, (_event, ...raw: unknown[]) => {
    const parsed = args.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`handling ${channel}: arguments are invalid`);
    }
    return run(...parsed.data);
  });
}

export function on<A extends unknown[]>(channel: string, args: z.ZodType<A>, run: (...args: A) => void): void {
  ipcMain.on(channel, (_event, ...raw: unknown[]) => {
    const parsed = args.safeParse(raw);
    if (parsed.success) {
      run(...parsed.data);
    }
  });
}
