import { spawn as childSpawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IPty } from 'node-pty';
import { spawn as ptySpawn } from 'node-pty';
import type { RemoteConfig } from '@shared/types/config';
import { parentEnv } from './localRunner';
import { collect, followLines, MAX_BUFFER, vmHome } from './runner';
import type { ExecOptions, ExecResult, PtyOptions, Runner } from './runner';

export type SshDeps = { spawn: typeof childSpawn; spawnPty: typeof ptySpawn };

export const KEEP_ALIVE_MS = 30_000;
export const MAX_ERROR_CHARS = 1000;

const SSH_FAILED = 255;

function errorText(stderr: string): string {
  return stderr.trim().slice(0, MAX_ERROR_CHARS);
}

export function shellQuote(arg: string): string {
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

export function remoteCommand(cmd: string[], cwd?: string, env: Record<string, string> = {}): string {
  const assignments = Object.entries(env).map(([name, value]) => shellQuote(`${name}=${value}`));
  const prefix = assignments.length > 0 ? ['exec', 'env', ...assignments] : ['exec'];
  const command = [...prefix, ...cmd.map(shellQuote)].join(' ');

  return cwd === undefined ? command : `cd ${shellQuote(cwd)} && ${command}`;
}

export class SshRunner implements Runner {
  constructor(
    private readonly remote: RemoteConfig,
    private readonly configDir: string,
    private readonly deps: SshDeps = { spawn: childSpawn, spawnPty: ptySpawn },
  ) {}

  async exec(cmd: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const result = await this.run(remoteCommand(cmd, opts.cwd), opts.input, opts.maxBuffer);

    return { ...result, stdout: result.stdout.toString('utf8') };
  }

  spawnPty(cmd: string[], opts: PtyOptions): IPty {
    const args = [...this.base(), '-t', this.target(), '--', remoteCommand(cmd, opts.cwd, opts.env)];

    return this.deps.spawnPty('ssh', args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: homedir(),
      env: { ...parentEnv(), TERM: 'xterm-256color' },
    });
  }

  async readFile(path: string): Promise<Buffer> {
    const { stdout, stderr, code } = await this.run(remoteCommand(['cat', '--', path]));

    if (code === 0) {
      return stdout;
    }

    const error = new Error(`reading ${path}: ${errorText(stderr)}`);
    const missing = code !== SSH_FAILED && stderr.includes('No such file or directory');

    throw missing ? Object.assign(error, { code: 'ENOENT' }) : error;
  }

  follow(path: string, onLine: (line: string) => void): () => void {
    const command = remoteCommand(['tail', '-n', '0', '-F', '--', path]);

    return followLines(() => this.deps.spawn('ssh', [...this.base(), this.target(), '--', command]), onLine);
  }

  async start(): Promise<void> {
    const { vaultSocket } = this.remote;
    const forward = vaultSocket === null ? [] : ['-R', `${vmHome(this.remote)}/.xena/vault.sock:${vaultSocket}`];
    const args = [...this.base(), '-f', '-N', '-o', 'ExitOnForwardFailure=yes', ...forward, this.target()];

    const { stderr, code } = await collect(this.deps.spawn('ssh', args), undefined, MAX_BUFFER);

    if (code !== 0) {
      throw new Error(`starting ssh master: ${errorText(stderr)}`);
    }
  }

  async check(): Promise<boolean> {
    const args = [...this.base(), '-O', 'check', this.target()];
    const { code } = await collect(this.deps.spawn('ssh', args), undefined, MAX_BUFFER);

    return code === 0;
  }

  keepAlive(
    onError: (err: unknown) => void,
    intervalMs: number = KEEP_ALIVE_MS,
    onRestart: () => void = () => undefined,
  ): () => void {
    let busy = false;
    let stopped = false;

    const tick = async () => {
      if (busy) {
        return;
      }

      busy = true;
      try {
        if (!(await this.check()) && !stopped) {
          onRestart();
          await this.start();
        }
      } catch (err) {
        onError(err);
      } finally {
        busy = false;
      }
    };

    const timer = setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  private run(command: string, input?: string, maxBuffer: number = MAX_BUFFER) {
    return collect(this.deps.spawn('ssh', [...this.base(), this.target(), '--', command]), input, maxBuffer);
  }

  private target(): string {
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
}
