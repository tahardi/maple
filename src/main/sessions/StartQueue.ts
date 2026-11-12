import { EventEmitter } from 'node:events';
import type { QueuedCard, QueueState, WaitReason } from '@shared/types/queue/queueState';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, type Logger } from '@main/app/log/log';
import type { SessionManager } from './SessionManager';
import type { StatusEngine } from './StatusEngine';
import { errorText } from '@shared/errors/errorText';

export const RECHECK_MS = 15_000;

export type HostLoad = { loadAverage: number; cores: number; freeBytes: number };
export type StartLimits = {
  startAtOnce: number;
  maxWorking: number;
  maxLoadPerCore: number;
  minFreeMegabytes: number;
  startGapSeconds: number;
};
export type StartQueueDeps = {
  sessions: SessionManager;
  status: StatusEngine;
  limits: () => StartLimits;
  load: () => HostLoad;
  queued: QueuedCard[];
  save: (cards: QueuedCard[]) => Promise<void>;
  logger?: Logger;
};

export class StartQueue extends EventEmitter<{ changed: [state: QueueState] }> {
  private cards: QueuedCard[];
  private failure: string | null = null;
  private started = false;
  private pumping = false;
  private sent = '';
  private lastStart: number | null = null;
  private paceTimer: ReturnType<typeof setTimeout> | null = null;
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
      return this.startNow({ projectKey, cardKey });
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

  move(cardKey: string, index: number): void {
    const from = this.cards.findIndex((c) => c.cardKey === cardKey);
    if (from === -1 || index === from || index < 0 || index >= this.cards.length) {
      return;
    }
    const cards = [...this.cards];
    cards.splice(index, 0, ...cards.splice(from, 1));
    this.cards = cards;
    this.changed(true);
  }

  state(): QueueState {
    return {
      cards: [...this.cards],
      working: this.working(),
      limit: this.deps.limits().maxWorking,
      waitingFor: this.cards.length === 0 ? null : this.waitingFor(),
      gapSeconds: this.deps.limits().startGapSeconds,
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
      if (this.paceTimer !== null) {
        clearTimeout(this.paceTimer);
        this.paceTimer = null;
      }
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
          this.startNow(next);
        } catch (err) {
          this.failure = `starting ${next.cardKey}: ${errorText(err)}`;
          this.log.warn('session', 'queued start failed', { cardKey: next.cardKey, error: errorText(err) });
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
    this.schedulePace();
  }

  private schedulePace(): void {
    if (this.paceTimer !== null || this.lastStart === null || this.cards.length === 0 || this.waitingFor() !== 'pace') {
      return;
    }
    this.paceTimer = setTimeout(
      () => {
        this.paceTimer = null;
        this.pump();
      },
      this.lastStart + this.deps.limits().startGapSeconds * 1000 - Date.now(),
    );
  }

  private startNow(card: QueuedCard): TabState {
    this.lastStart = Date.now();
    return this.deps.sessions.startCard(card.projectKey, card.cardKey);
  }

  private working(): number {
    return this.deps.status.statuses().filter((s) => s.dot === 'working').length;
  }

  private waitingFor(): WaitReason | null {
    const limits = this.deps.limits();
    const load = this.deps.load();
    const working = this.working();
    if (working >= limits.maxWorking) {
      return 'room';
    }
    if (load.loadAverage >= limits.maxLoadPerCore * load.cores) {
      return 'cpu';
    }
    if (load.freeBytes < limits.minFreeMegabytes * 1024 * 1024) {
      return 'memory';
    }
    if (
      (working >= limits.startAtOnce || this.cards.length > 0) &&
      this.lastStart !== null &&
      Date.now() - this.lastStart < limits.startGapSeconds * 1000
    ) {
      return 'pace';
    }
    return null;
  }

  private changed(save: boolean): void {
    if (save) {
      this.deps.save([...this.cards]).catch((err: unknown) => {
        this.log.error('session', 'failed', { operation: 'saveQueue', error: errorText(err) });
      });
    }
    const state = this.state();
    this.sent = JSON.stringify(state);
    this.emit('changed', state);
  }
}
