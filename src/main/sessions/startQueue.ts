import { EventEmitter } from 'node:events';
import type { QueuedCard, QueueState, WaitReason } from '@shared/types/queue';
import type { TabState } from '@shared/types/tabs';
import { appLogger, type Logger } from '@main/app/log';
import type { SessionManager } from './sessions';
import type { StatusEngine } from './status';

export const RECHECK_MS = 15_000;

export type HostLoad = { loadAverage: number; cores: number; freeBytes: number };
export type StartLimits = { maxWorking: number; maxLoadPerCore: number; minFreeMegabytes: number };
export type StartQueueDeps = {
  sessions: SessionManager;
  status: StatusEngine;
  limits: () => StartLimits;
  load: () => HostLoad;
  queued: QueuedCard[];
  save: (cards: QueuedCard[]) => Promise<void>;
  logger?: Logger;
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class StartQueue extends EventEmitter<{ changed: [state: QueueState] }> {
  private cards: QueuedCard[];
  private failure: string | null = null;
  private started = false;
  private pumping = false;
  private sent = '';
  private readonly log: Logger;

  constructor(private readonly deps: StartQueueDeps) {
    super();
    this.cards = [...deps.queued];
    this.log = deps.logger ?? appLogger;
  }

  add(projectKey: string, cardKey: string): TabState | null {
    const open = this.deps.sessions.list().find((t) => t.projectKey === projectKey && t.cardKey === cardKey);
    if (open) {
      return open;
    }
    const hadFailure = this.failure !== null;
    this.failure = null;
    if (this.cards.length === 0 && this.waitingFor() === null) {
      if (hadFailure) {
        this.changed(false);
      }
      return this.deps.sessions.startCard(projectKey, cardKey);
    }
    if (!this.cards.some((c) => c.cardKey === cardKey)) {
      this.cards.push({ projectKey, cardKey });
      this.log.info('session', 'queued', { cardKey });
      this.changed(true);
    } else if (hadFailure) {
      this.changed(false);
    }
    this.pump();
    return null;
  }

  remove(cardKey: string): void {
    const kept = this.cards.filter((c) => c.cardKey !== cardKey);
    if (kept.length !== this.cards.length) {
      this.cards = kept;
      this.changed(true);
    }
  }

  move(cardKey: string, offset: -1 | 1): void {
    const from = this.cards.findIndex((c) => c.cardKey === cardKey);
    const to = from + offset;
    if (from === -1 || to < 0 || to >= this.cards.length) {
      return;
    }
    const cards = [...this.cards];
    [cards[from], cards[to]] = [cards[to], cards[from]];
    this.cards = cards;
    this.changed(true);
  }

  state(): QueueState {
    return {
      cards: [...this.cards],
      working: this.working(),
      limit: this.deps.limits().maxWorking,
      waitingFor: this.cards.length === 0 ? null : this.waitingFor(),
      failure: this.failure,
    };
  }

  start(): () => void {
    const pump = () => {
      this.pump();
    };
    this.started = true;
    this.deps.status.on('status', pump);
    this.deps.sessions.on('changed', pump);
    const timer = setInterval(pump, RECHECK_MS);
    this.pump();
    return () => {
      this.started = false;
      clearInterval(timer);
      this.deps.status.off('status', pump);
      this.deps.sessions.off('changed', pump);
    };
  }

  private pump(): void {
    if (!this.started || this.pumping) {
      return;
    }
    this.pumping = true;
    let changed = false;
    try {
      while (this.cards.length > 0 && this.waitingFor() === null) {
        const [next, ...rest] = this.cards;
        this.cards = rest;
        changed = true;
        try {
          this.log.info('session', 'queued start', { cardKey: next.cardKey });
          this.deps.sessions.startCard(next.projectKey, next.cardKey);
        } catch (err) {
          this.failure = `starting ${next.cardKey}: ${message(err)}`;
          this.log.warn('session', 'queued start failed', { cardKey: next.cardKey, error: message(err) });
        }
      }
    } finally {
      this.pumping = false;
    }
    if (changed) {
      this.changed(true);
    } else if (JSON.stringify(this.state()) !== this.sent) {
      this.changed(false);
    }
  }

  private working(): number {
    return this.deps.status.statuses().filter((s) => s.dot === 'working').length;
  }

  private waitingFor(): WaitReason | null {
    const limits = this.deps.limits();
    const load = this.deps.load();
    if (this.working() >= limits.maxWorking) {
      return 'room';
    }
    if (load.loadAverage >= limits.maxLoadPerCore * load.cores) {
      return 'cpu';
    }
    if (load.freeBytes < limits.minFreeMegabytes * 1024 * 1024) {
      return 'memory';
    }
    return null;
  }

  private changed(save: boolean): void {
    if (save) {
      this.deps.save([...this.cards]).catch((err: unknown) => {
        this.log.error('session', 'failed', { operation: 'saveQueue', error: message(err) });
      });
    }
    const state = this.state();
    this.sent = JSON.stringify(state);
    this.emit('changed', state);
  }
}
