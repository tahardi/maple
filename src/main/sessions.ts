import { EventEmitter } from 'node:events';
import { stripVTControlCharacters } from 'node:util';
import type { IPty, spawn } from 'node-pty';
import { parseBatch } from '@shared/batch';
import { cardPrompt } from '@shared/prompts';
import type { MapleConfig, TabState } from '@shared/types';
import { findWorktree } from './git';
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
};

type Events = {
  data: [tabId: string, data: string];
  spawn: [tabId: string, prompted: boolean, resumed: boolean];
  exit: [tabId: string, code: number];
  input: [tabId: string];
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

export class SessionManager extends EventEmitter<Events> {
  private readonly sessions = new Map<string, Session>();
  private readonly closed: Record<string, string>;

  constructor(private readonly deps: SessionDeps) {
    super();
    this.closed = { ...deps.closedSessions };
  }

  startCard(projectKey: string, cardKey: string): TabState {
    return this.findCard(projectKey, cardKey) ?? this.open(projectKey, 'card', cardKey, null, cardPrompt(cardKey));
  }

  openCard(projectKey: string, cardKey: string, resumeId: string | null): TabState {
    const closedId = Object.hasOwn(this.closed, cardKey) ? this.closed[cardKey] : null;
    return this.findCard(projectKey, cardKey) ?? this.open(projectKey, 'card', cardKey, resumeId ?? closedId, null);
  }

  openPlanner(projectKey: string, resumeId: string | null): TabState {
    const existing = this.list().find((tab) => tab.kind === 'planner' && tab.projectKey === projectKey);
    return existing ?? this.open(projectKey, 'planner', null, resumeId, null);
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

  setWorktree(tabId: string, path: string): void {
    const session = this.require(tabId);
    session.tab = { ...session.tab, worktreePath: path };
    this.changed();
  }

  write(tabId: string, data: string): void {
    const session = this.sessions.get(tabId);
    if (!session) {
      return;
    }
    session.pty?.write(data);
    this.emit('input', tabId);
  }

  resize(tabId: string, cols: number, rows: number): void {
    this.sessions.get(tabId)?.pty?.resize(cols, rows);
  }

  sendPrompt(tabId: string, text: string): void {
    const session = this.sessions.get(tabId);
    if (!session) {
      return;
    }
    session.pty?.write(text);
    setTimeout(() => {
      session.pty?.write('\r');
    }, 100);
    this.emit('input', tabId);
  }

  backlog(tabId: string): string {
    return this.sessions.get(tabId)?.backlog ?? '';
  }

  isAlive(tabId: string): boolean {
    return this.sessions.get(tabId)?.alive ?? false;
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
  ): TabState {
    const tab: TabState = {
      id: this.deps.uuid(),
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
    session.pty?.kill();
    const { tab } = session;
    const project = this.deps.config().projects.find((p) => p.jiraKey === tab.projectKey);
    if (!project) {
      throw new Error(`starting session: unknown project ${tab.projectKey}`);
    }
    const args = ['--dangerously-skip-permissions', '--settings', this.deps.hooksFile];
    args.push(resume ? '--resume' : '--session-id', tab.sessionId);
    if (prompt !== null) {
      args.push(prompt);
    }
    const pty = this.deps.spawn('claude', args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: project.plannerDir,
      env: { ...process.env, MAPLE_TAB_ID: tab.id, MAPLE_SOCKET: this.deps.socketPath, TERM: 'xterm-256color' },
    });
    session.pty = pty;
    session.alive = true;
    this.emit('spawn', tab.id, prompt !== null, resume);
    pty.onData((data) => {
      this.onData(session, data);
    });
    pty.onExit(({ exitCode }) => {
      if (session.pty === pty) {
        session.alive = false;
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
      const path = await findWorktree(worktreesDir, cardKey).catch(() => null);
      if (done || path === null || this.sessions.get(session.tab.id) !== session) {
        return;
      }
      session.stopWatch();
      this.setWorktree(session.tab.id, path);
    };
    try {
      stop = watchWorktrees(worktreesDir, () => void check());
    } catch {
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
      console.error(`saving state: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.emit('changed', tabs);
  }
}
