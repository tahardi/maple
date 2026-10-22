import { EventEmitter } from 'node:events';
import { stripVTControlCharacters } from 'node:util';
import type { IPty, spawn } from 'node-pty';
import { parseBatch } from '@shared/batch';
import { cardPrompt } from '@shared/prompts';
import type { MapleConfig, TabState } from '@shared/types';
import { findWorktree } from './git';
import { appLogger, type Logger } from './log';
import { tmuxArgs } from './tmux';
import { watchWorktrees } from './worktreeWatcher';

const BACKLOG_CHARS = 200_000;
const LINE_CHARS = 10_000;

export type SessionDeps = {
  spawn: typeof spawn;
  config: () => MapleConfig;
  hooksFile: string;
  socketPath: string;
  save: (tabs: TabState[], closedSessions: Record<string, string>) => Promise<void>;
  closedSessions: Record<string, string>;
  uuid: () => string;
  hasTranscript: (sessionId: string) => boolean;
  tmuxConf: string;
  endTmux: (name: string | null) => void;
  sessionEnv: Record<string, string>;
  logger?: Logger;
};

type Events = {
  data: [tabId: string, data: string];
  spawn: [tabId: string, prompted: boolean, resumed: boolean];
  exit: [tabId: string, code: number];
  input: [tabId: string];
  interrupt: [tabId: string];
  batch: [projectKey: string, keys: string[]];
  changed: [tabs: TabState[]];
};

type Session = {
  tab: TabState;
  pty: IPty | null;
  alive: boolean;
  backlog: string;
  line: string;
  stopWatch: () => void;
};

type Launch = { resume: boolean; prompt: string | null };

export function parentEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_CHILD_SESSION;
  return env;
}

function tmuxName(tabId: string): string {
  return `maple-${tabId}`;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class SessionManager extends EventEmitter<Events> {
  private readonly sessions = new Map<string, Session>();
  private readonly closed: Record<string, string>;
  private readonly log: Logger;

  constructor(private readonly deps: SessionDeps) {
    super();
    this.closed = { ...deps.closedSessions };
    this.log = deps.logger ?? appLogger;
  }

  startCard(projectKey: string, cardKey: string): TabState {
    return (
      this.findCard(projectKey, cardKey) ?? this.open(projectKey, 'card', cardKey, null, cardPrompt(cardKey), null)
    );
  }

  openCard(projectKey: string, cardKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    const closedId = Object.hasOwn(this.closed, cardKey) ? this.closed[cardKey] : null;
    return (
      this.findCard(projectKey, cardKey) ?? this.open(projectKey, 'card', cardKey, resumeId ?? closedId, null, tabId)
    );
  }

  openPlanner(projectKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    const existing = this.list().find((tab) => tab.kind === 'planner' && tab.projectKey === projectKey);
    return existing ?? this.open(projectKey, 'planner', null, resumeId, null, tabId);
  }

  resume(tabId: string): void {
    const session = this.require(tabId);
    this.launch(session, { resume: true, prompt: null });
  }

  startFresh(tabId: string): void {
    const session = this.require(tabId);
    session.tab = { ...session.tab, sessionId: this.deps.uuid() };
    const prompt = session.tab.cardKey === null ? null : cardPrompt(session.tab.cardKey);
    this.launch(session, { resume: false, prompt });
    this.changed();
  }

  close(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) {
      return;
    }
    session.stopWatch();
    session.pty?.kill();
    this.deps.endTmux(tmuxName(tabId));
    this.sessions.delete(tabId);
    if (session.tab.cardKey !== null) {
      this.closed[session.tab.cardKey] = session.tab.sessionId;
    }
    this.changed();
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.stopWatch();
      session.pty?.kill();
    }
    this.deps.endTmux(null);
  }

  hasProject(projectKey: string): boolean {
    return this.deps.config().projects.some((p) => p.jiraKey === projectKey);
  }

  get(tabId: string): TabState | null {
    return this.sessions.get(tabId)?.tab ?? null;
  }

  list(): TabState[] {
    return [...this.sessions.values()].map((session) => session.tab);
  }

  setWorktree(tabId: string, path: string | null): void {
    const session = this.require(tabId);
    session.tab = { ...session.tab, worktreePath: path };
    this.changed();
  }

  write(tabId: string, data: string): void {
    const session = this.live(tabId);
    if (!session) {
      return;
    }
    session.pty?.write(data);
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
    const session = this.live(tabId);
    if (!session) {
      return;
    }
    session.pty?.write(text);
    this.log.info('session', 'prompt sent', { tabId, text: text.slice(0, 80) });
    setTimeout(() => {
      if (session.alive) {
        session.pty?.write('\r');
      }
    }, 100);
    this.emit('input', tabId);
  }

  backlog(tabId: string): string {
    return this.sessions.get(tabId)?.backlog ?? '';
  }

  isAlive(tabId: string): boolean {
    return this.sessions.get(tabId)?.alive ?? false;
  }

  private live(tabId: string): Session | undefined {
    const session = this.sessions.get(tabId);
    return session?.alive ? session : undefined;
  }

  private findCard(projectKey: string, cardKey: string): TabState | undefined {
    return this.list().find((tab) => tab.projectKey === projectKey && tab.cardKey === cardKey);
  }

  private require(tabId: string): Session {
    const session = this.sessions.get(tabId);
    if (!session) {
      throw new Error(`finding tab: ${tabId} does not exist`);
    }
    return session;
  }

  private open(
    projectKey: string,
    kind: TabState['kind'],
    cardKey: string | null,
    resumeId: string | null,
    prompt: string | null,
    tabId: string | null,
  ): TabState {
    const tab: TabState = {
      id: tabId ?? this.deps.uuid(),
      projectKey,
      kind,
      cardKey,
      sessionId: resumeId ?? this.deps.uuid(),
      worktreePath: null,
    };
    const session: Session = { tab, pty: null, alive: false, backlog: '', line: '', stopWatch: () => undefined };
    this.sessions.set(tab.id, session);
    this.launch(session, { resume: resumeId !== null, prompt });
    this.changed();
    if (cardKey !== null) {
      this.trackWorktree(session, cardKey);
    }
    return tab;
  }

  private launch(session: Session, { resume, prompt }: Launch): void {
    const { tab } = session;
    if (session.pty !== null) {
      session.pty.kill();
      this.deps.endTmux(tmuxName(tab.id));
    }
    const resumable = resume && this.deps.hasTranscript(tab.sessionId);
    if (resume && !resumable) {
      this.log.warn('session', 'no transcript, starting fresh', { tabId: tab.id, sessionId: tab.sessionId });
    }
    const project = this.deps.config().projects.find((p) => p.jiraKey === tab.projectKey);
    if (!project) {
      throw new Error(`starting session: unknown project ${tab.projectKey}`);
    }
    const args = ['--dangerously-skip-permissions', '--settings', this.deps.hooksFile];
    args.push(resumable ? '--resume' : '--session-id', tab.sessionId);
    if (prompt !== null) {
      args.push(prompt);
    }
    const env = { MAPLE_TAB_ID: tab.id, MAPLE_SOCKET: this.deps.socketPath };
    const command = tmuxArgs(tmuxName(tab.id), this.deps.tmuxConf, project.plannerDir, env, ['claude', ...args]);
    const pty = this.deps.spawn('tmux', command, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: project.plannerDir,
      env: { ...parentEnv(), ...this.deps.sessionEnv, TERM: 'xterm-256color' },
    });
    session.pty = pty;
    session.alive = true;
    this.log.info('session', 'spawned', {
      tabId: tab.id,
      cardKey: tab.cardKey,
      sessionId: tab.sessionId,
      cwd: project.plannerDir,
      args,
      resumed: resumable,
    });
    this.emit('spawn', tab.id, prompt !== null, resumable);
    pty.onData((data) => {
      this.onData(session, data);
    });
    pty.onExit(({ exitCode }) => {
      if (session.pty === pty) {
        session.alive = false;
        this.log.info('session', 'exited', { tabId: session.tab.id, code: exitCode });
        this.emit('exit', session.tab.id, exitCode);
      }
    });
  }

  private onData(session: Session, data: string): void {
    session.backlog = (session.backlog + data).slice(-BACKLOG_CHARS);
    this.emit('data', session.tab.id, data);
    if (session.tab.kind !== 'planner') {
      return;
    }
    const lines = (session.line + data).split('\n');
    session.line = (lines.pop() ?? '').slice(-LINE_CHARS);
    for (const line of lines) {
      const keys = parseBatch(stripVTControlCharacters(line).replace(/\r$/, ''));
      if (keys !== null) {
        this.emit('batch', session.tab.projectKey, keys);
      }
    }
  }

  private trackWorktree(session: Session, cardKey: string): void {
    const { worktreesDir } = this.deps.config();
    let done = false;
    let stop: () => void = () => undefined;
    const check = async () => {
      const path = await findWorktree(worktreesDir, cardKey).catch((err: unknown) => {
        this.log.warn('worktree', 'failed', { operation: 'findWorktree', cardKey, error: message(err) });
        return undefined;
      });
      const current = session.tab.worktreePath;
      if (done || path === undefined || path === current || this.sessions.get(session.tab.id) !== session) {
        return;
      }
      if (path === null) {
        this.log.info('worktree', 'gone', { cardKey });
      } else {
        this.log.info('worktree', 'found', { cardKey, path });
      }
      this.setWorktree(session.tab.id, path);
    };
    try {
      stop = watchWorktrees(worktreesDir, () => void check());
    } catch (err) {
      this.log.warn('worktree', 'failed', { operation: 'watchWorktrees', cardKey, error: message(err) });
      stop = () => undefined;
    }
    session.stopWatch = () => {
      done = true;
      stop();
    };
    void check();
  }

  private changed(): void {
    const tabs = this.list();
    this.deps.save(tabs, { ...this.closed }).catch((err: unknown) => {
      this.log.error('session', 'failed', { operation: 'saveState', error: message(err) });
    });
    this.emit('changed', tabs);
  }
}
