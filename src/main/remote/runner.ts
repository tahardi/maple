import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir } from 'node:os';
import type { IPty } from 'node-pty';
import type { RemoteConfig } from '@shared/types/config/remoteConfig';
import { errorText } from '@shared/errors/errorText';

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecOptions = { cwd?: string; input?: string; maxBuffer?: number };
export type PtyOptions = { cwd: string; env: Record<string, string>; cols: number; rows: number };

export type Runner = {
  exec(cmd: string[], opts?: ExecOptions): Promise<ExecResult>;
  spawnPty(cmd: string[], opts: PtyOptions): IPty;
  readFile(path: string): Promise<Buffer>;
  follow(path: string, onLine: (line: string) => void): () => void;
};

export const MAX_BUFFER = 64 * 1024 * 1024;
export const FOLLOW_RESTART_MS = 5000;

export function collect(
  child: ChildProcessWithoutNullStreams,
  input: string | undefined,
  maxBuffer: number,
): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let done = false;

    const finish = (code: number, text = stderr): void => {
      if (done) {
        return;
      }
      done = true;
      resolve({ stdout: Buffer.concat(out), stderr: text, code });
    };

    child.stdout.on('data', (chunk: Buffer) => {
      if (done) {
        return;
      }
      size += chunk.length;
      if (size > maxBuffer) {
        done = true;
        child.kill();
        reject(new Error(`running command: output exceeds ${String(maxBuffer)} bytes`));
        return;
      }
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      finish(err.code === 'ENOENT' ? 127 : 1, errorText(err));
    });
    child.on('close', (code: number | null) => {
      finish(code ?? 1);
    });

    child.stdin.on('error', () => undefined);
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export function followLines(start: () => ChildProcessWithoutNullStreams, onLine: (line: string) => void): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let child: ChildProcessWithoutNullStreams | null = null;

  const run = (): void => {
    let partial = '';
    child = start();
    child.stdout.on('data', (chunk: Buffer) => {
      const parts = (partial + chunk.toString('utf8')).split('\n');
      partial = parts.pop() ?? '';
      parts.forEach(onLine);
    });
    child.on('error', () => undefined);
    child.on('close', () => {
      if (stopped) {
        return;
      }
      timer = setTimeout(run, FOLLOW_RESTART_MS);
    });
  };

  run();
  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
    }
    child?.kill();
  };
}

export function vmHome(remote: RemoteConfig | null): string {
  return remote === null ? homedir() : `/home/${remote.user}`;
}
