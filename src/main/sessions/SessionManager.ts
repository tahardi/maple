import { EventEmitter } from 'node:events';
import type { spawn } from 'node-pty';
import { cardPrompt } from '@shared/prompts/cardPrompt';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, type Logger } from '@main/app/log/log';
import { ClaudeProcesses } from './manager/ClaudeProcesses';
import { TabRegistry } from './manager/TabRegistry';
import { TabSaver } from './manager/TabSaver';
import { WorktreeTracker } from './manager/WorktreeTracker';
import { withSelectedWorktree, withWorktrees } from './manager/worktreeSelection';

export type SessionDeps = {
  spawn: typeof spawn;
  config: () => MapleConfig;
  hooksFile: string;
  socketPath: string;
  snapshotRoot: string;
  findingsDir: string;
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

export class SessionManager extends EventEmitter<Events> {
  private readonly log: Logger;
  private readonly tabs: TabRegistry;
  private readonly saver: TabSaver;
  private readonly worktrees: WorktreeTracker;
  private readonly processes: ClaudeProcesses;

  constructor(private readonly deps: SessionDeps) {
    super();
    this.log = deps.logger ?? appLogger;
    this.tabs = new TabRegistry(deps.closedSessions);
    this.saver = new TabSaver({ save: deps.save, snapshot: () => this.tabs.snapshot(), logger: this.log });
    this.worktrees = new WorktreeTracker({
      worktreesDir: () => deps.config().worktreesDir,
      current: (tabId) => this.tabs.get(tabId)?.worktreePaths ?? null,
      found: (tabId, paths) => {
        this.setWorktrees(tabId, paths);
      },
      logger: this.log,
    });
    this.processes = new ClaudeProcesses(deps);
    this.processes.on('data', (...args) => this.emit('data', ...args));
    this.processes.on('spawn', (...args) => this.emit('spawn', ...args));
    this.processes.on('exit', (...args) => this.emit('exit', ...args));
    this.processes.on('input', (...args) => this.emit('input', ...args));
    this.processes.on('interrupt', (...args) => this.emit('interrupt', ...args));
    this.processes.on('batch', (...args) => this.emit('batch', ...args));
  }

  startCard(projectKey: string, cardKey: string): TabState {
    return (
      this.tabs.findCard(projectKey, cardKey) ?? this.open(projectKey, 'card', cardKey, null, cardPrompt(cardKey), null)
    );
  }

  openCard(projectKey: string, cardKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    return (
      this.tabs.findCard(projectKey, cardKey) ??
      this.open(projectKey, 'card', cardKey, resumeId ?? this.tabs.resumeIdFor(projectKey, cardKey), null, tabId)
    );
  }

  openPlanner(projectKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    return this.tabs.findKind(projectKey, 'planner') ?? this.open(projectKey, 'planner', null, resumeId, null, tabId);
  }

  openVault(projectKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    const existing = this.tabs.findKind(projectKey, 'vault');
    if (existing) {
      return existing;
    }
    if (this.deps.config().vaultDir === null) {
      throw new Error('opening vault: no vaultDir in config');
    }
    return this.open(projectKey, 'vault', null, resumeId, null, tabId);
  }

  openLearning(projectKey: string, resumeId: string | null, tabId: string | null = null): TabState {
    const existing = this.tabs.findKind(projectKey, 'learning');
    if (existing) {
      return existing;
    }
    if (this.deps.config().vaultDir === null) {
      throw new Error('opening learning: no vaultDir in config');
    }
    return this.open(projectKey, 'learning', null, resumeId, null, tabId);
  }

  resume(tabId: string): void {
    this.processes.launch(this.tabs.require(tabId), { resume: true, prompt: null });
  }

  startFresh(tabId: string): void {
    const tab = { ...this.tabs.require(tabId), sessionId: this.deps.uuid() };
    this.tabs.update(tab);
    const prompt = tab.cardKey === null ? null : cardPrompt(tab.cardKey);
    this.processes.launch(tab, { resume: false, prompt });
    this.changed();
  }

  close(tabId: string): void {
    if (this.tabs.get(tabId) === null) {
      return;
    }
    this.worktrees.stop(tabId);
    this.processes.kill(tabId);
    this.tabs.close(tabId);
    this.changed();
  }

  killAll(): void {
    this.worktrees.stopAll();
    this.processes.killAll();
  }

  hasProject(projectKey: string): boolean {
    return this.deps.config().projects.some((p) => p.jiraKey === projectKey);
  }

  get(tabId: string): TabState | null {
    return this.tabs.get(tabId);
  }

  sessionOf(cardKey: string): string | null {
    return this.tabs.sessionOf(cardKey);
  }

  list(): TabState[] {
    return this.tabs.list();
  }

  setWorktrees(tabId: string, paths: string[]): void {
    this.tabs.update(withWorktrees(this.tabs.require(tabId), paths));
    this.changed();
  }

  selectWorktree(tabId: string, path: string): void {
    const tab = withSelectedWorktree(this.tabs.require(tabId), path);
    this.tabs.update(tab);
    this.log.info('worktree', 'selected', { cardKey: tab.cardKey, path });
    this.changed();
  }

  holdSaves(): () => void {
    return this.saver.hold();
  }

  keep(tab: TabState): void {
    this.tabs.keep(tab);
  }

  write(tabId: string, data: string): void {
    this.processes.write(tabId, data);
  }

  resize(tabId: string, cols: number, rows: number): void {
    this.processes.resize(tabId, cols, rows);
  }

  sendPrompt(tabId: string, text: string): void {
    this.processes.sendPrompt(tabId, text);
  }

  backlog(tabId: string): string {
    return this.processes.backlog(tabId);
  }

  isAlive(tabId: string): boolean {
    return this.processes.isAlive(tabId);
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
    this.tabs.add(tab);
    try {
      this.processes.launch(tab, { resume: resumeId !== null, prompt });
    } catch (err) {
      this.tabs.drop(tab.id);
      throw err;
    }
    this.tabs.forgetKept(tab);
    this.changed();
    if (cardKey !== null) {
      this.worktrees.track(tab.id, cardKey);
    }
    return tab;
  }

  private changed(): void {
    this.saver.changed();
    this.emit('changed', this.list());
  }
}
