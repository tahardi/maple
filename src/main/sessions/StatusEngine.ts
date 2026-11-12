import { EventEmitter } from 'node:events';
import { nextDot, type DotInput } from '@shared/status/dots';
import { tabWorktrees } from '@shared/worktree/tabWorktrees';
import type { Card } from '@shared/types/jira';
import type { Dot, HookEvent, SyncState, TabState, TabStatus } from '@shared/types/tabs';
import type { PrInfo } from '@shared/types/github';
import { appLogger, type Logger } from '@main/app/log/log';
import { withTimeout } from '@main/util/withTimeout';
import { backgroundWait, unknownTasks, type BackgroundWait } from './backgroundWait';
import type { SessionManager } from './SessionManager';

export type StatusDeps = {
  sessions: SessionManager;
  getCard: (key: string) => Promise<Card>;
  prFor: (worktree: string, projectKey: string) => Promise<PrInfo | null>;
  waitLimitMs: () => number;
  logger?: Logger;
};

type Events = { status: [status: TabStatus, prev: Dot] };

const RESUME_FAIL_MS = 5000;
const LOOKUP_TIMEOUT_MS = 15_000;

type Tracked = {
  status: TabStatus;
  seq: number;
  resumedAt: number | null;
  background: boolean;
  asking: boolean;
  waitLimit?: NodeJS.Timeout;
};

export class StatusEngine extends EventEmitter<Events> {
  private readonly tabs = new Map<string, Tracked>();
  private readonly log: Logger;

  constructor(private readonly deps: StatusDeps) {
    super();
    this.log = deps.logger ?? appLogger;
    const { sessions } = deps;
    sessions.on('spawn', (tabId, prompted, resumed) => {
      const prev = this.tabs.get(tabId);
      clearTimeout(prev?.waitLimit);
      const dot = prompted ? 'working' : 'idle';
      const status: TabStatus = { tabId, dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null };
      this.tabs.set(tabId, {
        status,
        seq: (prev?.seq ?? 0) + 1,
        resumedAt: resumed ? Date.now() : null,
        background: false,
        asking: false,
      });
      if (prev && prev.status.dot !== dot) {
        this.log.info('dot', 'changed', { tabId, from: prev.status.dot, to: dot, input: 'spawn' });
      }
      this.emitStatus(tabId, prev?.status.dot ?? dot);
      if (!prompted) {
        void this.restoreDot(tabId, resumed);
      }
    });
    sessions.on('exit', (tabId, exitCode) => {
      const tracked = this.tabs.get(tabId);
      if (tracked) {
        clearTimeout(tracked.waitLimit);
        const { resumedAt } = tracked;
        const prev = tracked.status.dot;
        const resumeFailed = exitCode !== 0 && resumedAt !== null && Date.now() - resumedAt < RESUME_FAIL_MS;
        const dot = prev === 'working' ? 'idle' : prev;
        tracked.status = { ...tracked.status, dot, sessionAlive: false, exitCode, resumeFailed };
        if (dot !== prev) {
          this.log.info('dot', 'changed', { tabId, from: prev, to: dot, input: 'exit' });
        }
        if (resumeFailed) {
          this.log.warn('session', 'resume failed', { tabId, code: exitCode });
        }
        this.emitStatus(tabId, prev);
      }
    });
    sessions.on('interrupt', (tabId) => {
      const tracked = this.tabs.get(tabId);
      if (tracked?.status.dot === 'working' && !tracked.background) {
        void this.stop(tabId);
      }
    });
    sessions.on('changed', (tabs) => {
      const open = new Set(tabs.map((t) => t.id));
      for (const [tabId, tracked] of this.tabs) {
        if (!open.has(tabId)) {
          clearTimeout(tracked.waitLimit);
          this.tabs.delete(tabId);
        }
      }
    });
  }

  hook(e: HookEvent): void {
    if (e.event === 'UserPromptSubmit') {
      this.bump(e.tabId);
      this.apply(e.tabId, { type: 'prompt' });
    } else if (e.event === 'Notification' && e.notificationType === 'permission_prompt') {
      this.bump(e.tabId);
      const tracked = this.tabs.get(e.tabId);
      if (tracked) {
        tracked.asking = true;
      }
      this.apply(e.tabId, { type: 'permission' });
    } else if (e.event === 'Stop') {
      this.stopped(e);
    }
  }

  setSync(tabId: string, sync: SyncState): void {
    const tracked = this.tabs.get(tabId);
    if (!tracked || tracked.status.sync === sync) {
      return;
    }
    const from = tracked.status.sync;
    tracked.status = { ...tracked.status, sync };
    this.log.info('session', 'sync changed', { tabId, from, to: sync });
    this.emit('status', tracked.status, tracked.status.dot);
  }

  asking(tabId: string): boolean {
    return this.tabs.get(tabId)?.asking ?? false;
  }

  statuses(): TabStatus[] {
    return [...this.tabs.values()].map((t) => t.status);
  }

  private stopped(e: HookEvent): void {
    const tasks = e.backgroundTasks ?? [];
    for (const type of unknownTasks(tasks)) {
      this.log.warn('hook', 'unknown task type', { tabId: e.tabId, type });
    }
    const wait = backgroundWait(tasks, e.crons ?? 0);
    if (wait === null) {
      void this.stop(e.tabId);
    } else {
      this.background(e.tabId, wait);
    }
  }

  private background(tabId: string, wait: BackgroundWait): void {
    const tracked = this.tabs.get(tabId);
    if (!tracked?.status.sessionAlive) {
      return;
    }
    this.bump(tabId);
    tracked.background = true;
    if (wait === 'limited') {
      tracked.waitLimit = setTimeout(() => {
        this.log.info('dot', 'wait limit reached', { tabId });
        void this.stop(tabId);
      }, this.deps.waitLimitMs());
    }
    this.apply(tabId, { type: 'background' });
  }

  private async stop(tabId: string): Promise<void> {
    const tab = this.deps.sessions.get(tabId);
    const seq = this.bump(tabId);
    if (!tab || seq === null) {
      return;
    }
    if (tab.kind === 'planner' || tab.cardKey === null) {
      this.apply(tabId, { type: 'stop', kind: 'planner', cardStatus: null, prs: [] });
      return;
    }
    let input: DotInput | null;
    try {
      const [card, prs] = await Promise.all([
        withTimeout(this.deps.getCard(tab.cardKey), LOOKUP_TIMEOUT_MS).catch((err: unknown) =>
          this.fail('jira', 'getCard', err),
        ),
        this.prsFor(tab),
      ]);
      input = { type: 'stop', kind: 'card', cardStatus: card.status, prs };
    } catch {
      input = null;
    }
    const tracked = this.tabs.get(tabId);
    if (tracked?.seq === seq) {
      this.setDot(tracked, input === null ? 'waiting' : nextDot(input), this.inputFields(input));
    }
  }

  private async restoreDot(tabId: string, resumed: boolean): Promise<void> {
    const tab = this.deps.sessions.get(tabId);
    const seq = this.tabs.get(tabId)?.seq;
    if (tab?.kind !== 'card' || tab.cardKey === null || seq === undefined) {
      return;
    }
    let input: DotInput;
    try {
      const card = await withTimeout(this.deps.getCard(tab.cardKey), LOOKUP_TIMEOUT_MS).catch((err: unknown) =>
        this.fail('jira', 'getCard', err),
      );
      const fresh = this.deps.sessions.get(tabId);
      const prs = card.status === 'In Review' && fresh !== null ? await this.prsFor(fresh) : [];
      input = { type: 'stop', kind: 'card', cardStatus: card.status, prs };
    } catch {
      return;
    }
    const dot = nextDot(input);
    const tracked = this.tabs.get(tabId);
    if ((resumed || dot === 'merged') && tracked?.seq === seq) {
      this.setDot(tracked, dot, { ...this.inputFields(input), input: 'spawn' }, dot);
    }
  }

  private async prsFor(tab: TabState): Promise<PrInfo[]> {
    const prs = await Promise.all(
      tabWorktrees(tab).map((path) =>
        withTimeout(this.deps.prFor(path, tab.projectKey), LOOKUP_TIMEOUT_MS).catch((err: unknown) =>
          this.fail('gh', 'prFor', err),
        ),
      ),
    );
    return prs.filter((pr) => pr !== null);
  }

  private fail(scope: 'jira' | 'gh', operation: string, err: unknown): never {
    this.log.warn(scope, 'failed', { operation, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  private inputFields(input: DotInput | null): Record<string, unknown> {
    if (input?.type !== 'stop') {
      return { input: input?.type ?? 'stop' };
    }
    const { cardStatus, prs } = input;
    const failedChecks = prs.reduce((sum, p) => sum + p.checks.failed, 0);
    return { input: 'stop', cardStatus, prs: prs.map((p) => p.state), failedChecks };
  }

  private bump(tabId: string): number | null {
    const tracked = this.tabs.get(tabId);
    if (!tracked) {
      return null;
    }
    tracked.seq += 1;
    tracked.background = false;
    tracked.asking = false;
    clearTimeout(tracked.waitLimit);
    return tracked.seq;
  }

  private apply(tabId: string, input: DotInput): void {
    const tracked = this.tabs.get(tabId);
    if (!tracked) {
      return;
    }
    this.setDot(tracked, nextDot(input), this.inputFields(input));
  }

  private setDot(tracked: Tracked, dot: Dot, fields: Record<string, unknown>, emittedPrev?: Dot): void {
    const prev = tracked.status.dot;
    if (dot !== prev) {
      tracked.status = { ...tracked.status, dot };
      this.log.info('dot', 'changed', { tabId: tracked.status.tabId, from: prev, to: dot, ...fields });
      this.emit('status', tracked.status, emittedPrev ?? prev);
    }
  }

  private emitStatus(tabId: string, prev: Dot): void {
    const tracked = this.tabs.get(tabId);
    if (tracked) {
      this.emit('status', tracked.status, prev);
    }
  }
}
