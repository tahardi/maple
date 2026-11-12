import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { IPty, spawn } from 'node-pty';
import { parseSuggestedBatch } from '@shared/prompts/suggestedBatch';
import { cardPrompt } from '@shared/prompts/cardPrompt';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import { findWorktrees } from '@main/git/findWorktrees';
import { appLogger, type Logger } from '@main/app/log/log';
import { tmuxArgs } from './tmux';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import { errorText } from '@shared/errors/errorText';

const BACKLOG_CHARS = 200_000;
const LINE_CHARS = 10_000;

export type SessionDeps = {
  spawn: typeof spawn;
  config: () => MapleConfig;
  hooksFile: string;
  socketPath: string;
  snapshotRoot: string;
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

export class SessionManager extends EventEmitter<Events> {
  private readonly sessions = new Map<string, Session>();
  private readonly closed: Record<string, string>;
  private readonly log: Logger;
  private kept: TabState[] = [];
  private holding = false;
  private unsaved = false;

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
    const keptId = this.kept.find((k) => k.projectKey === projectKey && k.cardKey === cardKey)?.sessionId ?? null;
    const closedId = Object.hasOwn(this.closed, cardKey) ? this.closed[cardKey] : null;
    return (
      this.findCard(projectKey, cardKey) ??
      this.open(projectKey, 'card', cardKey, resumeId ?? keptId ?? closedId, null, tabId)
    );
  }

  openPlanner(projectKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    const existing = this.list().find((tab) => tab.kind === 'planner' && tab.projectKey === projectKey);
    return existing ?? this.open(projectKey, 'planner', null, resumeId, null, tabId);
  }

  openVault(projectKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    const existing = this.list().find((tab) => tab.kind === 'vault' && tab.projectKey === projectKey);
    if (existing) {
      return existing;
    }
    if (this.deps.config().vaultDir === null) {
      throw new Error('opening vault: no vaultDir in config');
    }
    return this.open(projectKey, 'vault', null, resumeId, null, tabId);
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

  sessionOf(cardKey: string): string | null {
    const open = this.list().find((tab) => tab.cardKey === cardKey);
    return open?.sessionId ?? (Object.hasOwn(this.closed, cardKey) ? this.closed[cardKey] : null);
  }

  list(): TabState[] {
    return [...this.sessions.values()].map((session) => session.tab);
  }

  setWorktrees(tabId: string, paths: string[]): void {
    const session = this.require(tabId);
    const { worktreePath, worktreePaths } = session.tab;
    const newest = paths.at(0) ?? null;
    const kept = worktreePath !== null && paths.includes(worktreePath) ? worktreePath : newest;
    const selected = newest !== null && !worktreePaths.includes(newest) ? newest : kept;
    session.tab = { ...session.tab, worktreePath: selected, worktreePaths: paths };
    this.changed();
  }

  selectWorktree(tabId: string, path: string): void {
    const session = this.require(tabId);
    if (!session.tab.worktreePaths.includes(path)) {
      throw new Error(`selecting worktree: ${path} is not a worktree of ${session.tab.cardKey ?? tabId}`);
    }
    session.tab = { ...session.tab, worktreePath: path };
    this.log.info('worktree', 'selected', { cardKey: session.tab.cardKey, path });
    this.changed();
  }

  holdSaves(): () => void {
    this.holding = true;
    this.unsaved = false;
    return () => {
      this.holding = false;
      if (this.unsaved) {
        this.save();
      }
    };
  }

  keep(tab: TabState): void {
    this.kept.push(tab);
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
    this.log.info('session', 'prompt sent', { tabId, length: text.length });
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
      worktreePaths: [],
    };
    const session: Session = { tab, pty: null, alive: false, backlog: '', line: '', stopWatch: () => undefined };
    this.sessions.set(tab.id, session);
    try {
      this.launch(session, { resume: resumeId !== null, prompt });
    } catch (err) {
      this.sessions.delete(tab.id);
      throw err;
    }
    this.kept = this.kept.filter((k) => k.kind !== kind || k.projectKey !== projectKey || k.cardKey !== cardKey);
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
    session.pty = pty;
    session.alive = true;
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
      const keys = parseSuggestedBatch(stripVTControlCharacters(line).replace(/\r$/, ''));
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
      const paths = await findWorktrees(worktreesDir, cardKey).catch((err: unknown) => {
        this.log.warn('worktree', 'failed', { operation: 'findWorktrees', cardKey, error: errorText(err) });
        return undefined;
      });
      const current = session.tab.worktreePaths;
      const unchanged = paths?.length === current.length && paths.every((path, i) => path === current[i]);
      if (done || paths === undefined || unchanged || this.sessions.get(session.tab.id) !== session) {
        return;
      }
      if (paths.length === 0) {
        this.log.info('worktree', 'gone', { cardKey });
      } else {
        this.log.info('worktree', 'found', { cardKey, paths });
      }
      this.setWorktrees(session.tab.id, paths);
    };
    try {
      stop = watchWorktrees(worktreesDir, () => void check());
    } catch (err) {
      this.log.warn('worktree', 'failed', { operation: 'watchWorktrees', cardKey, error: errorText(err) });
      stop = () => undefined;
    }
    session.stopWatch = () => {
      done = true;
      stop();
    };
    void check();
  }

  private changed(): void {
    if (this.holding) {
      this.unsaved = true;
    } else {
      this.save();
    }
    this.emit('changed', this.list());
  }

  private save(): void {
    this.deps.save([...this.list(), ...this.kept], { ...this.closed }).catch((err: unknown) => {
      this.log.error('session', 'failed', { operation: 'saveState', error: errorText(err) });
    });
  }
}
