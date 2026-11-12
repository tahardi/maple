import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { IPty } from 'node-pty';
import { parseSuggestedBatch } from '@shared/prompts/suggestedBatch';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, type Logger } from '@main/app/log/log';
import { parentEnv } from '@main/util/parentEnv';
import { tmuxArgs } from '../tmux';
import type { SessionDeps } from '../SessionManager';

const BACKLOG_CHARS = 200_000;
const LINE_CHARS = 10_000;

type Events = {
  data: [tabId: string, data: string];
  spawn: [tabId: string, prompted: boolean, resumed: boolean];
  exit: [tabId: string, code: number];
  input: [tabId: string];
  interrupt: [tabId: string];
  batch: [projectKey: string, keys: string[]];
};

type Process = {
  pty: IPty | null;
  alive: boolean;
  backlog: string;
  line: string;
};

function tmuxName(tabId: string): string {
  return `maple-${tabId}`;
}

export class ClaudeProcesses extends EventEmitter<Events> {
  private readonly processes = new Map<string, Process>();
  private readonly log: Logger;

  constructor(private readonly deps: Omit<SessionDeps, 'save' | 'closedSessions' | 'uuid'>) {
    super();
    this.log = deps.logger ?? appLogger;
  }

  launch(tab: TabState, { resume, prompt }: { resume: boolean; prompt: string | null }): void {
    const proc = this.processes.get(tab.id) ?? { pty: null, alive: false, backlog: '', line: '' };
    if (proc.pty !== null) {
      proc.pty.kill();
      this.deps.endTmux(tmuxName(tab.id));
    }
    const resumable = resume && this.deps.hasTranscript(tab.sessionId);
    if (resume && !resumable) {
      this.log.warn('session', 'no transcript, starting fresh', { tabId: tab.id, sessionId: tab.sessionId });
    }
    const config = this.deps.config();
    const project = config.projects.find((p) => p.jiraKey === tab.projectKey);
    if (!project) {
      throw new Error(`starting session: unknown project ${tab.projectKey}`);
    }
    const cwd = tab.kind === 'vault' ? config.vaultDir : project.plannerDir;
    if (cwd === null) {
      throw new Error('starting session: no vaultDir in config');
    }
    const args = ['--dangerously-skip-permissions', '--settings', this.deps.hooksFile];
    args.push(resumable ? '--resume' : '--session-id', tab.sessionId);
    if (prompt !== null) {
      args.push(prompt);
    }
    const env = {
      MAPLE_TAB_ID: tab.id,
      MAPLE_SOCKET: this.deps.socketPath,
      ...(tab.kind === 'card' && { MAPLE_SNAPSHOT_DIR: join(this.deps.snapshotRoot, tab.sessionId) }),
      ...(tab.kind === 'card' && config.vaultDir !== null && { MAPLE_VAULT_DIR: config.vaultDir }),
    };
    const command = tmuxArgs(tmuxName(tab.id), this.deps.tmuxConf, cwd, env, ['claude', ...args]);
    const pty = this.deps.spawn('tmux', command, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd,
      env: { ...parentEnv(), ...this.deps.sessionEnv, TERM: 'xterm-256color' },
    });
    proc.pty = pty;
    proc.alive = true;
    this.processes.set(tab.id, proc);
    this.log.info('session', 'spawned', {
      tabId: tab.id,
      cardKey: tab.cardKey,
      sessionId: tab.sessionId,
      cwd,
      args,
      resumed: resumable,
    });
    this.emit('spawn', tab.id, prompt !== null, resumable);
    pty.onData((data) => {
      this.onData(tab, proc, data);
    });
    pty.onExit(({ exitCode }) => {
      if (proc.pty === pty) {
        proc.alive = false;
        this.log.info('session', 'exited', { tabId: tab.id, code: exitCode });
        this.emit('exit', tab.id, exitCode);
      }
    });
  }

  write(tabId: string, data: string): void {
    const proc = this.live(tabId);
    if (!proc) {
      return;
    }
    proc.pty?.write(data);
    this.emit('input', tabId);
    if (data === '\x1b' || data === '\x03') {
      this.emit('interrupt', tabId);
    }
  }

  resize(tabId: string, cols: number, rows: number): void {
    if (cols >= 1 && rows >= 1) {
      this.live(tabId)?.pty?.resize(cols, rows);
    }
  }

  sendPrompt(tabId: string, text: string): void {
    const proc = this.live(tabId);
    if (!proc) {
      return;
    }
    proc.pty?.write(text);
    this.log.info('session', 'prompt sent', { tabId, length: text.length });
    setTimeout(() => {
      if (proc.alive) {
        proc.pty?.write('\r');
      }
    }, 100);
    this.emit('input', tabId);
  }

  backlog(tabId: string): string {
    return this.processes.get(tabId)?.backlog ?? '';
  }

  isAlive(tabId: string): boolean {
    return this.processes.get(tabId)?.alive ?? false;
  }

  kill(tabId: string): void {
    this.processes.get(tabId)?.pty?.kill();
    this.deps.endTmux(tmuxName(tabId));
    this.processes.delete(tabId);
  }

  killAll(): void {
    for (const proc of this.processes.values()) {
      proc.pty?.kill();
    }
    this.deps.endTmux(null);
  }

  private live(tabId: string): Process | undefined {
    const proc = this.processes.get(tabId);
    return proc?.alive ? proc : undefined;
  }

  private onData(tab: TabState, proc: Process, data: string): void {
    proc.backlog = (proc.backlog + data).slice(-BACKLOG_CHARS);
    this.emit('data', tab.id, data);
    if (tab.kind !== 'planner') {
      return;
    }
    const lines = (proc.line + data).split('\n');
    proc.line = (lines.pop() ?? '').slice(-LINE_CHARS);
    for (const line of lines) {
      const keys = parseSuggestedBatch(stripVTControlCharacters(line).replace(/\r$/, ''));
      if (keys !== null) {
        this.emit('batch', tab.projectKey, keys);
      }
    }
  }
}
