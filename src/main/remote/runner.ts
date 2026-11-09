import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir } from 'node:os';
import type { IPty } from 'node-pty';
import type { RemoteConfig } from '@shared/types/config';

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
export const MAX_FOLLOW_LINE = 1024 * 1024;

export function collect(
  child: ChildProcessWithoutNullStreams,
  input: string | undefined,
  maxBuffer: number,
): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;

    const keep = (chunks: Buffer[], chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBuffer) {
        child.kill();
        reject(new Error(`running command: output exceeds ${String(maxBuffer)} bytes`));
        return;
      }
      chunks.push(chunk);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      keep(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      keep(stderr, chunk);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ stdout: Buffer.alloc(0), stderr: err.message, code: err.code === 'ENOENT' ? 127 : 1 });
    });
    child.on('close', (code: number | null) => {
      resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString('utf8'), code: code ?? 1 });
    });

    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

export function followLines(start: () => ChildProcessWithoutNullStreams, onLine: (line: string) => void): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let child: ChildProcessWithoutNullStreams;

  const run = () => {
    let partial = '';
    let dropping = false;

    child = start();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() ?? '';

      if (dropping && lines.length > 0) {
        lines.shift();
        dropping = false;
      }

      for (const line of lines) {
        onLine(line);
      }

      if (partial.length > MAX_FOLLOW_LINE) {
        partial = '';
        dropping = true;
      }
    });
    child.stderr.resume();
    child.on('error', () => undefined);
    child.on('close', () => {
      if (!stopped) {
        timer = setTimeout(run, FOLLOW_RESTART_MS);
      }
    });
  };

  run();

  return () => {
    stopped = true;
    clearTimeout(timer);
    child.kill();
  };
}

export function vmHome(remote: RemoteConfig | null): string {
  return remote === null ? homedir() : `/home/${remote.user}`;
}
