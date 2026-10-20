import { EventEmitter } from 'node:events';
import type { IPty, spawn } from 'node-pty';
import { parentEnv } from './sessions';

const BACKLOG_CHARS = 200_000;

export type TerminalDeps = { spawn: typeof spawn };

type Events = {
  data: [tabId: string, data: string];
  exit: [tabId: string, code: number];
};

type Shell = { pty: IPty; alive: boolean; backlog: string };

export class Terminals extends EventEmitter<Events> {
  private readonly shells = new Map<string, Shell>();

  constructor(private readonly deps: TerminalDeps) {
    super();
  }

  open(tabId: string, cwd: string): void {
    const existing = this.shells.get(tabId);
    if (existing?.alive) {
      return;
    }
    const env = parentEnv();
    delete env.MAPLE_TAB_ID;
    delete env.MAPLE_SOCKET;
    const pty = this.deps.spawn(process.env.SHELL ?? '/bin/bash', ['-l'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd,
      env: { ...env, TERM: 'xterm-256color' },
    });
    const shell: Shell = { pty, alive: true, backlog: existing?.backlog ?? '' };
    this.shells.set(tabId, shell);
    pty.onData((data) => {
      shell.backlog = (shell.backlog + data).slice(-BACKLOG_CHARS);
      this.emit('data', tabId, data);
    });
    pty.onExit(({ exitCode }) => {
      if (this.shells.get(tabId) === shell) {
        shell.alive = false;
        this.emit('exit', tabId, exitCode);
      }
    });
  }

  write(tabId: string, data: string): void {
    this.live(tabId)?.pty.write(data);
  }

  resize(tabId: string, cols: number, rows: number): void {
    if (cols >= 1 && rows >= 1) {
      this.live(tabId)?.pty.resize(cols, rows);
    }
  }

  backlog(tabId: string): string {
    return this.shells.get(tabId)?.backlog ?? '';
  }

  close(tabId: string): void {
    this.shells.get(tabId)?.pty.kill();
    this.shells.delete(tabId);
  }

  closeAll(): void {
    for (const tabId of [...this.shells.keys()]) {
      this.close(tabId);
    }
  }

  private live(tabId: string): Shell | undefined {
    const shell = this.shells.get(tabId);
    return shell?.alive ? shell : undefined;
  }
}
