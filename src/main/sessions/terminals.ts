import { EventEmitter } from 'node:events';
import type { IPty, spawn } from 'node-pty';
import { parentEnv } from './sessions';

const BACKLOG_CHARS = 200_000;

export type TerminalDeps = { spawn: typeof spawn };

type Events = {
  data: [terminalId: string, data: string];
  exit: [terminalId: string, code: number];
};

type Shell = { pty: IPty; alive: boolean; backlog: string };

export class Terminals extends EventEmitter<Events> {
  private readonly shells = new Map<string, Shell>();

  constructor(private readonly deps: TerminalDeps) {
    super();
  }

  open(terminalId: string, cwd: string): void {
    const existing = this.shells.get(terminalId);
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
    this.shells.set(terminalId, shell);
    pty.onData((data) => {
      shell.backlog = (shell.backlog + data).slice(-BACKLOG_CHARS);
      this.emit('data', terminalId, data);
    });
    pty.onExit(({ exitCode }) => {
      if (this.shells.get(terminalId) === shell) {
        shell.alive = false;
        this.emit('exit', terminalId, exitCode);
      }
    });
  }

  write(terminalId: string, data: string): void {
    this.live(terminalId)?.pty.write(data);
  }

  resize(terminalId: string, cols: number, rows: number): void {
    if (cols >= 1 && rows >= 1) {
      this.live(terminalId)?.pty.resize(cols, rows);
    }
  }

  backlog(terminalId: string): string {
    return this.shells.get(terminalId)?.backlog ?? '';
  }

  close(terminalId: string): void {
    this.shells.get(terminalId)?.pty.kill();
    this.shells.delete(terminalId);
  }

  closeTab(tabId: string): void {
    for (const terminalId of [...this.shells.keys()]) {
      if (terminalId === tabId || terminalId.startsWith(`${tabId}:`)) {
        this.close(terminalId);
      }
    }
  }

  closeAll(): void {
    for (const terminalId of [...this.shells.keys()]) {
      this.close(terminalId);
    }
  }

  private live(terminalId: string): Shell | undefined {
    const shell = this.shells.get(terminalId);
    return shell?.alive ? shell : undefined;
  }
}
