import { spawn as childSpawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import type { RemoteConfig } from '@shared/types/config/remoteConfig';
import { parentEnv } from '@main/util/parentEnv';
import {
  collect,
  followLines,
  MAX_BUFFER,
  vmHome,
  type ExecOptions,
  type ExecResult,
  type PtyOptions,
  type Runner,
} from './runner';

export type SshDeps = { spawn: typeof childSpawn; spawnPty: typeof ptySpawn };

export const KEEP_ALIVE_MS = 30_000;

export function shellQuote(arg: string): string {
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

export function remoteCommand(cmd: string[], cwd?: string, env?: Record<string, string>): string {
  const vars = Object.entries(env ?? {}).map(([key, value]) => shellQuote(`${key}=${value}`));
  const words = [...(vars.length ? ['env', ...vars] : []), ...cmd.map(shellQuote)];
  const run = `exec ${words.join(' ')}`;
  return cwd === undefined ? run : `cd ${shellQuote(cwd)} && ${run}`;
}

export class SshRunner implements Runner {
  constructor(
    private readonly remote: RemoteConfig,
    private readonly configDir: string,
    private readonly deps: SshDeps = { spawn: childSpawn, spawnPty: ptySpawn },
  ) {}

  async exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const result = await this.run(remoteCommand(cmd, opts.cwd), opts.input, opts.maxBuffer ?? MAX_BUFFER);
    return { ...result, stdout: result.stdout.toString('utf8') };
  }

  spawnPty(cmd: string[], opts: PtyOptions): IPty {
    return this.deps.spawnPty(
      'ssh',
      [...this.base(), '-t', this.target, '--', remoteCommand(cmd, opts.cwd, opts.env)],
      {
        name: 'xterm-256color',
        cols: opts.cols,
        rows: opts.rows,
        cwd: homedir(),
        env: { ...parentEnv(), TERM: 'xterm-256color' },
      },
    );
  }

  async readFile(path: string): Promise<Buffer> {
    const result = await this.run(remoteCommand(['cat', '--', path]), undefined, MAX_BUFFER);
    if (result.code === 0) {
      return result.stdout;
    }
    const err = new Error(`reading ${path}: ${result.stderr.trim()}`);
    if (result.stderr.includes('No such file or directory')) {
      throw Object.assign(err, { code: 'ENOENT' });
    }
    throw err;
  }

  follow(path: string, onLine: (line: string) => void): () => void {
    const command = remoteCommand(['tail', '-n', '0', '-F', '--', path]);
    return followLines(() => this.deps.spawn('ssh', [...this.base(), this.target, '--', command]), onLine);
  }

  async start(): Promise<void> {
    const forward =
      this.remote.vaultSocket === null
        ? []
        : ['-R', `${vmHome(this.remote)}/.xena/vault.sock:${this.remote.vaultSocket}`];
    const child = this.deps.spawn('ssh', [
      ...this.base(),
      '-f',
      '-N',
      '-o',
      'ExitOnForwardFailure=yes',
      ...forward,
      this.target,
    ]);
    const result = await collect(child, undefined, MAX_BUFFER);
    if (result.code !== 0) {
      throw new Error(`starting ssh master: ${result.stderr.trim()}`);
    }
  }

  async check(): Promise<boolean> {
    const child = this.deps.spawn('ssh', [...this.base(), '-O', 'check', this.target]);
    const result = await collect(child, undefined, MAX_BUFFER);
    return result.code === 0;
  }

  keepAlive(onError: (err: unknown) => void, intervalMs = KEEP_ALIVE_MS): () => void {
    let busy = false;
    const tick = async (): Promise<void> => {
      if (busy) {
        return;
      }
      busy = true;
      try {
        if (!(await this.check())) {
          await this.start();
        }
      } catch (err) {
        onError(err);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      clearInterval(timer);
    };
  }

  private get target(): string {
    return `${this.remote.user}@${this.remote.host}`;
  }

  private base(): string[] {
    return [
      '-F',
      'none',
      '-i',
      this.remote.keyPath,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      `UserKnownHostsFile=${this.remote.knownHostsPath}`,
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ControlMaster=auto',
      '-o',
      `ControlPath=${join(this.configDir, 'ssh-%C')}`,
      '-o',
      'ControlPersist=10m',
      '-o',
      'ForwardX11=no',
      '-o',
      'ForwardAgent=no',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=3',
    ];
  }

  private run(command: string, input: string | undefined, maxBuffer: number): ReturnType<typeof collect> {
    const child = this.deps.spawn('ssh', [...this.base(), this.target, '--', command]);
    return collect(child, input, maxBuffer);
  }
}
