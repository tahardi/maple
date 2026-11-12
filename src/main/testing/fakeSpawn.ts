import type { IPty, spawn } from 'node-pty';
import { vi } from 'vitest';

export type FakePty = {
  file: string;
  args: string[];
  options: { cwd?: string; cols?: number; rows?: number; env?: Record<string, string | undefined> };
  written: string[];
  resized: [number, number][];
  killed: boolean;
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
};

export function fakeSpawn(ptys: FakePty[]): typeof spawn {
  return vi.fn<typeof spawn>((file, args, options) => {
    let onData: (data: string) => void = () => undefined;
    let onExit: (e: { exitCode: number }) => void = () => undefined;
    const fake: FakePty = {
      file,
      args: typeof args === 'string' ? [args] : args,
      options,
      written: [],
      resized: [],
      killed: false,
      emitData: (data) => {
        onData(data);
      },
      emitExit: (exitCode) => {
        onExit({ exitCode });
      },
    };
    ptys.push(fake);
    const pty = {
      onData: (cb: (data: string) => void) => {
        onData = cb;
        return { dispose: () => undefined };
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        onExit = cb;
        return { dispose: () => undefined };
      },
      write: (data: string) => {
        fake.written.push(data);
      },
      resize: (cols: number, rows: number) => {
        fake.resized.push([cols, rows]);
      },
      kill: () => {
        fake.killed = true;
      },
    };
    return pty as unknown as IPty;
  });
}
