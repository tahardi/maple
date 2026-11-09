import type { z } from 'zod';
import { eventSchemas, type EventRecord } from '@shared/types/events';
import type { PrInfo } from '@shared/types/github';
import type { Card, JiraStatus } from '@shared/types/jira';
import type { TabState } from '@shared/types/tabs';
import { appLogger, logFailure, type Logger } from '@main/app/log';
import { eventLog, type EventLog } from './eventLog';

type Schemas = typeof eventSchemas;

const LOOK_BACK_MS = 365 * 24 * 60 * 60 * 1000;
const DIFFED_TYPES = ['card.status', 'pr.opened', 'ci.result', 'pr.merged'];

type Recorded = { status: string | null; opened: number | null; ci: string | null; merged: number | null };

export type PrEventsDeps = {
  log: () => Pick<EventLog<Schemas>, 'append' | 'readEvents'>;
  now?: () => Date;
  logger?: Logger;
};

function ciKey(pr: number, passed: number, failed: number, failedChecks: readonly string[]): string {
  return JSON.stringify([pr, passed, failed, failedChecks]);
}

function restore(state: Recorded, { type, data }: EventRecord): void {
  if (type === 'card.status' && typeof data.to === 'string') {
    state.status = data.to;
  } else if (type === 'pr.opened' && typeof data.pr === 'number') {
    state.opened = data.pr;
  } else if (type === 'pr.merged' && typeof data.pr === 'number') {
    state.merged = data.pr;
  } else if (type === 'ci.result') {
    const ci = eventSchemas['ci.result'].safeParse(data);
    state.ci = ci.success ? ciKey(ci.data.pr, ci.data.passed, ci.data.failed, ci.data.failedChecks) : state.ci;
  }
}

export class PrEvents {
  private readonly recorded = new Map<string, Recorded>();
  private readonly now: () => Date;
  private readonly logger: Logger;
  private seeded: Promise<void> | null = null;

  constructor(private readonly deps: PrEventsDeps) {
    this.now = deps.now ?? (() => new Date());
    this.logger = deps.logger ?? appLogger;
  }

  async card(tab: TabState, status: JiraStatus): Promise<void> {
    const state = await this.stateFor(tab);
    if (state === null || state.status === status) {
      return;
    }
    const from = state.status;
    state.status = status;
    await this.append('card.status', tab, { from, to: status });
  }

  async pr(tab: TabState, pr: PrInfo | null): Promise<void> {
    const state = await this.stateFor(tab);
    if (state === null || pr === null) {
      return;
    }
    if (state.opened !== pr.number) {
      state.opened = pr.number;
      await this.append('pr.opened', tab, { pr: pr.number });
    }
    await this.ci(state, tab, pr);
    if (pr.state === 'MERGED') {
      await this.merged(state, tab, pr.number);
    }
  }

  async approved(tab: TabState, pr: number): Promise<void> {
    const state = await this.stateFor(tab);
    if (state === null) {
      return;
    }
    await this.append('pr.approved', tab, { pr });
    await this.merged(state, tab, pr);
  }

  async commented(tab: TabState, pr: number, length: number): Promise<void> {
    if ((await this.stateFor(tab)) !== null) {
      await this.append('review.comment', tab, { pr, length });
    }
  }

  async replied(tab: TabState, pr: number, commentId: number, length: number): Promise<void> {
    if ((await this.stateFor(tab)) !== null) {
      await this.append('review.reply', tab, { pr, commentId, length });
    }
  }

  async resolved(tab: TabState, threadId: string, resolved: boolean): Promise<void> {
    if ((await this.stateFor(tab)) !== null) {
      await this.append('review.resolve', tab, { threadId, resolved });
    }
  }

  tapCard(getCard: (key: string) => Promise<Card>, tabs: () => readonly TabState[]): (key: string) => Promise<Card> {
    return async (key) => {
      const card = await getCard(key);
      const tab = tabs().find((t) => t.cardKey === key);
      if (tab) {
        void this.card(tab, card.status);
      }
      return card;
    };
  }

  tapPr(
    prFor: (worktree: string, projectKey: string) => Promise<PrInfo | null>,
    tabs: () => readonly TabState[],
  ): (worktree: string, projectKey: string) => Promise<PrInfo | null> {
    return async (worktree, projectKey) => {
      const pr = await prFor(worktree, projectKey);
      const tab = tabs().find((t) => t.worktreePath === worktree);
      if (tab) {
        void this.pr(tab, pr);
      }
      return pr;
    };
  }

  private async ci(state: Recorded, tab: TabState, pr: PrInfo): Promise<void> {
    const { passed, failed, pending, total, runs } = pr.checks;
    const failedChecks = runs
      .filter((run) => run.bucket === 'fail')
      .map((run) => run.name)
      .sort();
    const key = ciKey(pr.number, passed, failed, failedChecks);
    if (pending !== 0 || total === 0 || state.ci === key) {
      return;
    }
    state.ci = key;
    await this.append('ci.result', tab, { pr: pr.number, passed, failed, failedChecks });
  }

  private async merged(state: Recorded, tab: TabState, pr: number): Promise<void> {
    if (state.merged === pr) {
      return;
    }
    state.merged = pr;
    await this.append('pr.merged', tab, { pr });
  }

  private async stateFor(tab: TabState): Promise<Recorded | null> {
    this.seeded ??= this.seed();
    await this.seeded;
    return tab.cardKey === null ? null : this.entry(tab.cardKey);
  }

  private async seed(): Promise<void> {
    const to = this.now();
    const filter = {
      from: new Date(to.getTime() - LOOK_BACK_MS).toISOString(),
      to: to.toISOString(),
      types: DIFFED_TYPES,
    };
    const records = await logFailure(this.logger, 'events', { operation: 'readEvents' }, async () =>
      this.deps.log().readEvents(filter),
    ).catch((): EventRecord[] => []);
    for (const record of records) {
      if (record.card !== null) {
        restore(this.entry(record.card), record);
      }
    }
  }

  private entry(card: string): Recorded {
    const found = this.recorded.get(card);
    if (found) {
      return found;
    }
    const fresh: Recorded = { status: null, opened: null, ci: null, merged: null };
    this.recorded.set(card, fresh);
    return fresh;
  }

  private append<T extends keyof Schemas>(type: T, tab: TabState, data: z.input<Schemas[T]>): Promise<void> {
    const refs = { project: tab.projectKey, card: tab.cardKey, tab: tab.id, session: tab.sessionId };
    return logFailure(this.logger, 'events', { operation: 'append', type }, async () => {
      await this.deps.log().append(type, refs, data);
    }).catch(() => undefined);
  }
}

export const prEvents = new PrEvents({ log: eventLog });
