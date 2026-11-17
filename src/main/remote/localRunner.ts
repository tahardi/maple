import { spawn as childSpawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { parentEnv } from '@main/util/parentEnv';
import {
  collect,
  followLines,
  MAX_BUFFER,
  type ExecOptions,
  type ExecResult,
  type PtyOptions,
  type Runner,
} from './runner';

export type LocalDeps = { spawn: typeof childSpawn; spawnPty: typeof ptySpawn };

export class LocalRunner implements Runner {
  constructor(private readonly deps: LocalDeps = { spawn: childSpawn, spawnPty: ptySpawn }) {}

  async exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const [program, ...args] = cmd;
    const child = this.deps.spawn(program, args, { cwd: opts.cwd });
    const result = await collect(child, opts.input, opts.maxBuffer ?? MAX_BUFFER, opts.timeout);
    return { ...result, stdout: result.stdout.toString('utf8') };
  }

  spawnPty(cmd: string[], opts: PtyOptions): IPty {
    const [program, ...args] = cmd;
    return this.deps.spawnPty(program, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: { ...parentEnv(), ...opts.env, TERM: 'xterm-256color' },
    });
  }

  readFile(path: string): Promise<Buffer> {
    return readFile(path);
  }

  follow(path: string, onLine: (line: string) => void): () => void {
    return followLines(() => this.deps.spawn('tail', ['-n', '0', '-F', '--', path]), onLine);
  }
}
