import { EventEmitter } from 'node:events';
import { nextDot, type DotInput } from '@shared/dots';
import type { Card, Dot, HookEvent, PrInfo, TabStatus } from '@shared/types';
import type { SessionManager } from './sessions';

export type StatusDeps = {
  sessions: SessionManager;
  getCard: (key: string) => Promise<Card>;
  prFor: (worktree: string) => Promise<PrInfo | null>;
  now: () => number;
};

type Events = { status: [status: TabStatus, prev: Dot] };

type Tracked = { status: TabStatus; lastInputAt: number; seq: number };

export class StatusEngine extends EventEmitter<Events> {
  private readonly tabs = new Map<string, Tracked>();

  constructor(private readonly deps: StatusDeps) {
    super();
    const { sessions, now } = deps;
    sessions.on('spawn', (tabId, prompted) => {
      const prev = this.tabs.get(tabId);
      const dot = prompted ? 'working' : 'idle';
      const status: TabStatus = { tabId, dot, sessionAlive: true, exitCode: null };
      this.tabs.set(tabId, { status, lastInputAt: 0, seq: (prev?.seq ?? 0) + 1 });
      this.emitStatus(tabId, prev?.status.dot ?? dot);
    });
    sessions.on('data', (tabId) => {
      this.apply(tabId, { type: 'output', at: now() });
    });
    sessions.on('input', (tabId) => {
      const tracked = this.tabs.get(tabId);
      if (tracked) {
        tracked.lastInputAt = now();
        this.apply(tabId, { type: 'input', at: tracked.lastInputAt });
      }
    });
    sessions.on('exit', (tabId, exitCode) => {
      const tracked = this.tabs.get(tabId);
      if (tracked) {
        tracked.status = { ...tracked.status, sessionAlive: false, exitCode };
        this.emitStatus(tabId, tracked.status.dot);
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
        this.deps.getCard(tab.cardKey),
        worktreePath === null ? null : this.deps.prFor(worktreePath),
      ]);
      input = { type: 'stop', kind: 'card', cardStatus: card.status, pr };
    } catch {
      input = null;
    }
    const tracked = this.tabs.get(tabId);
    if (tracked?.seq === seq) {
      this.setDot(tracked, input === null ? 'waiting' : nextDot(tracked.status.dot, input, tracked.lastInputAt));
    }
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
    this.setDot(tracked, nextDot(tracked.status.dot, input, tracked.lastInputAt));
  }

  private setDot(tracked: Tracked, dot: Dot): void {
    const prev = tracked.status.dot;
    if (dot !== prev) {
      tracked.status = { ...tracked.status, dot };
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
