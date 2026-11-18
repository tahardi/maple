import { EventEmitter } from 'node:events';
import { stripVTControlCharacters } from 'node:util';
import type { IPty } from 'node-pty';
import { parseSuggestedBatch } from '@shared/prompts/suggestedBatch';
import type { TabState } from '@shared/types/tabs/tabState';
import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from '@main/app/log/log';
import { vmFindingsDir } from '@main/remote/vmPaths';
import { tmuxArgs } from '../tmux';
import type { SessionDeps } from '../SessionManager';

const BACKLOG_CHARS = 200_000;
const LINE_CHARS = 10_000;
export const SSH_LOST_CODE = 255;
const REATTACH_DELAY_MS = 5000;
const REATTACH_LIMIT = 3;

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
  reattaches: number;
  timer: ReturnType<typeof setTimeout> | null;
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
    const proc = this.processes.get(tab.id) ?? {
      pty: null,
      alive: false,
      backlog: '',
      line: '',
      reattaches: 0,
      timer: null,
    };
    this.stopTimer(proc);
    proc.pty?.kill();
    const config = this.deps.config();
    const project = config.projects.find((p) => p.jiraKey === tab.projectKey);
    if (!project) {
      throw new Error(`starting session: unknown project ${tab.projectKey}`);
    }
    const cwd = tab.kind === 'vault' || tab.kind === 'learning' ? this.deps.home : project.plannerDir;
    const args = ['--dangerously-skip-permissions', resume ? '--resume' : '--session-id', tab.sessionId];
    if (prompt !== null) {
      args.push(prompt);
    }
    const env = {
      MAPLE_TAB_ID: tab.id,
      ...((tab.kind === 'card' || tab.kind === 'learning') && {
        MAPLE_FINDINGS_DIR: vmFindingsDir(this.deps.home),
      }),
    };
    const command = ['tmux', ...tmuxArgs(tmuxName(tab.id), this.deps.tmuxConf, cwd, env, ['claude', ...args])];
    const pty = this.deps.runner.spawnPty(command, { cwd, env: {}, cols: 120, rows: 40 });
    proc.pty = pty;
    proc.alive = true;
    this.processes.set(tab.id, proc);
    this.log.info('session', 'spawned', {
      tabId: tab.id,
      cardKey: tab.cardKey,
      sessionId: tab.sessionId,
      cwd,
      args,
      resumed: resume,
    });
    this.emit('spawn', tab.id, prompt !== null, resume);
    pty.onData((data) => {
      this.onData(tab, proc, data);
    });
    pty.onExit(({ exitCode }) => {
      if (proc.pty === pty) {
        this.onExit(tab, proc, exitCode);
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

  async kill(tabId: string): Promise<void> {
    const proc = this.processes.get(tabId);
    if (proc) {
      this.detach(proc);
    }
    this.processes.delete(tabId);
    await this.deps.endTmux(tmuxName(tabId));
  }

  killAll(): void {
    for (const proc of this.processes.values()) {
      this.detach(proc);
    }
  }

  private live(tabId: string): Process | undefined {
    const proc = this.processes.get(tabId);
    return proc?.alive ? proc : undefined;
  }

  private detach(proc: Process): void {
    this.stopTimer(proc);
    proc.pty?.kill();
    proc.pty = null;
    proc.alive = false;
  }

  private stopTimer(proc: Process): void {
    if (proc.timer !== null) {
      clearTimeout(proc.timer);
      proc.timer = null;
    }
  }

  private onExit(tab: TabState, proc: Process, exitCode: number): void {
    if (exitCode === SSH_LOST_CODE && proc.reattaches < REATTACH_LIMIT) {
      proc.reattaches += 1;
      this.log.warn('session', 'ssh lost, reattaching', { tabId: tab.id, attempt: proc.reattaches });
      proc.pty = null;
      proc.timer = setTimeout(() => {
        proc.timer = null;
        void this.reattach(tab, proc);
      }, REATTACH_DELAY_MS);
      return;
    }
    this.exited(tab, proc, exitCode);
  }

  private exited(tab: TabState, proc: Process, exitCode: number): void {
    proc.alive = false;
    this.log.info('session', 'exited', { tabId: tab.id, code: exitCode });
    this.emit('exit', tab.id, exitCode);
  }

  private async reattach(tab: TabState, proc: Process): Promise<void> {
    try {
      await this.deps.reconnect();
    } catch (err) {
      this.log.warn('session', 'failed', { operation: 'reconnect', tabId: tab.id, error: errorText(err) });
    }

    if (this.processes.get(tab.id) !== proc || !proc.alive) {
      return;
    }

    try {
      this.launch(tab, { resume: true, prompt: null });
    } catch (err) {
      this.log.warn('session', 'failed', { operation: 'reattach', tabId: tab.id, error: errorText(err) });
      this.exited(tab, proc, SSH_LOST_CODE);
    }
  }

  private onData(tab: TabState, proc: Process, data: string): void {
    proc.reattaches = 0;
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
