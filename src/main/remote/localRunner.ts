import { spawn as childSpawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { IPty } from 'node-pty';
import { spawn as ptySpawn } from 'node-pty';
import { collect, followLines, MAX_BUFFER } from './runner';
import type { ExecOptions, ExecResult, PtyOptions, Runner } from './runner';

export type LocalDeps = { spawn: typeof childSpawn; spawnPty: typeof ptySpawn };

export function parentEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_CHILD_SESSION;
  return env;
}

export class LocalRunner implements Runner {
  constructor(private readonly deps: LocalDeps = { spawn: childSpawn, spawnPty: ptySpawn }) {}

  async exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const child = this.deps.spawn(cmd[0], cmd.slice(1), { cwd: opts.cwd });
    const result = await collect(child, opts.input, opts.maxBuffer ?? MAX_BUFFER);

    return { ...result, stdout: result.stdout.toString('utf8') };
  }

  spawnPty(cmd: string[], opts: PtyOptions): IPty {
    return this.deps.spawnPty(cmd[0], cmd.slice(1), {
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
