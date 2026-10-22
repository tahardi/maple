import { EventEmitter } from 'node:events';
import { nextDot, type DotInput } from '@shared/dots';
import type { Card, Dot, HookEvent, PrInfo, TabStatus } from '@shared/types';
import { appLogger, type Logger } from '@main/app/log';
import type { SessionManager } from './sessions';

export type StatusDeps = {
  sessions: SessionManager;
  getCard: (key: string) => Promise<Card>;
  prFor: (worktree: string) => Promise<PrInfo | null>;
  logger?: Logger;
};

type Events = { status: [status: TabStatus, prev: Dot] };

const RESUME_FAIL_MS = 5000;
const LOOKUP_TIMEOUT_MS = 15_000;

type Tracked = { status: TabStatus; seq: number; resumedAt: number | null };

function timeout<T>(lookup: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timing out after ${String(LOOKUP_TIMEOUT_MS / 1000)}s`));
    }, LOOKUP_TIMEOUT_MS);
  });
  return Promise.race([lookup, expired]).finally(() => {
    clearTimeout(timer);
  });
}

export class StatusEngine extends EventEmitter<Events> {
  private readonly tabs = new Map<string, Tracked>();
  private readonly log: Logger;

  constructor(private readonly deps: StatusDeps) {
    super();
    this.log = deps.logger ?? appLogger;
    const { sessions } = deps;
    sessions.on('spawn', (tabId, prompted, resumed) => {
      const prev = this.tabs.get(tabId);
      const dot = prompted ? 'working' : 'idle';
      const status: TabStatus = { tabId, dot, sessionAlive: true, exitCode: null, resumeFailed: false };
      this.tabs.set(tabId, { status, seq: (prev?.seq ?? 0) + 1, resumedAt: resumed ? Date.now() : null });
      if (prev && prev.status.dot !== dot) {
        this.log.info('dot', 'changed', { tabId, from: prev.status.dot, to: dot, input: 'spawn' });
      }
      this.emitStatus(tabId, prev?.status.dot ?? dot);
      if (!prompted) {
        void this.restoreMergedDot(tabId);
      }
    });
    sessions.on('exit', (tabId, exitCode) => {
      const tracked = this.tabs.get(tabId);
      if (tracked) {
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
      if (this.tabs.get(tabId)?.status.dot === 'working') {
        void this.stop(tabId);
      }
    });
    sessions.on('changed', (tabs) => {
      const open = new Set(tabs.map((t) => t.id));
      for (const tabId of this.tabs.keys()) {
        if (!open.has(tabId)) {
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
      this.apply(e.tabId, { type: 'permission' });
    } else if (e.event === 'Stop') {
      void this.stop(e.tabId);
    }
  }

  statuses(): TabStatus[] {
    return [...this.tabs.values()].map((t) => t.status);
  }

  private async stop(tabId: string): Promise<void> {
    const tab = this.deps.sessions.get(tabId);
    const seq = this.bump(tabId);
    if (!tab || seq === null) {
      return;
    }
    if (tab.kind === 'planner' || tab.cardKey === null) {
      this.apply(tabId, { type: 'stop', kind: 'planner', cardStatus: null, pr: null });
      return;
    }
    const { worktreePath } = tab;
    let input: DotInput | null;
    try {
      const [card, pr] = await Promise.all([
        timeout(this.deps.getCard(tab.cardKey)).catch((err: unknown) => this.fail('jira', 'getCard', err)),
        worktreePath === null
          ? null
          : timeout(this.deps.prFor(worktreePath)).catch((err: unknown) => this.fail('gh', 'prFor', err)),
      ]);
      input = { type: 'stop', kind: 'card', cardStatus: card.status, pr };
    } catch {
      input = null;
    }
    const tracked = this.tabs.get(tabId);
    if (tracked?.seq === seq) {
      this.setDot(tracked, input === null ? 'waiting' : nextDot(input), this.inputFields(input));
    }
  }

  private async restoreMergedDot(tabId: string): Promise<void> {
    const tab = this.deps.sessions.get(tabId);
    const seq = this.tabs.get(tabId)?.seq;
    if (tab?.kind !== 'card' || tab.cardKey === null || seq === undefined) {
      return;
    }
    let card: Card;
    try {
      card = await timeout(this.deps.getCard(tab.cardKey)).catch((err: unknown) => this.fail('jira', 'getCard', err));
    } catch {
      return;
    }
    const tracked = this.tabs.get(tabId);
    if (card.status === 'Done' && tracked?.seq === seq) {
      this.setDot(tracked, 'merged', { input: 'spawn', cardStatus: card.status });
    }
  }

  private fail(scope: 'jira' | 'gh', operation: string, err: unknown): never {
    this.log.warn(scope, 'failed', { operation, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  private inputFields(input: DotInput | null): Record<string, unknown> {
    if (input?.type !== 'stop') {
      return { input: input?.type ?? 'stop' };
    }
    const { cardStatus, pr } = input;
    return { input: 'stop', cardStatus, pr: pr?.state ?? null, failedChecks: pr?.checks.failed ?? null };
  }

  private bump(tabId: string): number | null {
    const tracked = this.tabs.get(tabId);
    if (!tracked) {
      return null;
    }
    tracked.seq += 1;
    return tracked.seq;
  }

  private apply(tabId: string, input: DotInput): void {
    const tracked = this.tabs.get(tabId);
    if (!tracked) {
      return;
    }
    this.setDot(tracked, nextDot(input), this.inputFields(input));
  }

  private setDot(tracked: Tracked, dot: Dot, fields: Record<string, unknown>): void {
    const prev = tracked.status.dot;
    if (dot !== prev) {
      tracked.status = { ...tracked.status, dot };
      this.log.info('dot', 'changed', { tabId: tracked.status.tabId, from: prev, to: dot, ...fields });
      this.emit('status', tracked.status, prev);
    }
  }

  private emitStatus(tabId: string, prev: Dot): void {
    const tracked = this.tabs.get(tabId);
    if (tracked) {
      this.emit('status', tracked.status, prev);
    }
  }
}
