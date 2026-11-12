import type { z } from 'zod';
import { prRepo } from '@shared/github/prRepo';
import { tabWorktrees } from '@shared/worktree/tabWorktrees';
import { eventSchemas } from '@shared/types/events/eventSchemas';
import type { EventRecord } from '@shared/types/events/eventRecord';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Card } from '@shared/types/jira/card';
import type { JiraStatus } from '@shared/types/jira/jiraStatus';
import type { HookEvent } from '@shared/types/tabs/hookEvent';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { eventKeepDays, eventLog, type EventLog } from './eventLog';
import { KEEP_DAYS } from './pruneEvents';

type Schemas = typeof eventSchemas;

const DAY_MS = 24 * 60 * 60 * 1000;
const DIFFED_TYPES = ['card.status', 'pr.opened', 'ci.result', 'pr.merged'];

type RepoRecord = { opened: string | null; ci: string | null; merged: string | null };
type Recorded = { status: string | null; repos: Map<string, RepoRecord> };

export type PrEventsDeps = {
  log: () => Pick<EventLog<Schemas>, 'append' | 'readEvents'>;
  now?: () => Date;
  keepDays?: () => number;
  logger?: Logger;
};

function prKey(repo: string, pr: number): string {
  return `${repo}#${String(pr)}`;
}

function ciKey(repo: string, pr: number, passed: number, failed: number, failedChecks: readonly string[]): string {
  return JSON.stringify([repo, pr, passed, failed, failedChecks]);
}

function repoRecord(state: Recorded, repo: string): RepoRecord {
  const found = state.repos.get(repo);
  if (found) {
    return found;
  }
  const fresh: RepoRecord = { opened: null, ci: null, merged: null };
  state.repos.set(repo, fresh);
  return fresh;
}

function restore(state: Recorded, { type, data }: EventRecord): void {
  if (type === 'card.status' && typeof data.to === 'string') {
    state.status = data.to;
  } else if (type === 'pr.opened' || type === 'pr.merged') {
    const pr = eventSchemas['pr.opened'].safeParse(data);
    if (pr.success) {
      repoRecord(state, pr.data.repo)[type === 'pr.opened' ? 'opened' : 'merged'] = prKey(pr.data.repo, pr.data.pr);
    }
  } else if (type === 'ci.result') {
    const ci = eventSchemas['ci.result'].safeParse(data);
    if (ci.success) {
      const { repo, pr, passed, failed, failedChecks } = ci.data;
      repoRecord(state, repo).ci = ciKey(repo, pr, passed, failed, failedChecks);
    }
  }
}

export class PrEvents {
  private readonly recorded = new Map<string, Recorded>();
  private readonly hookSessions = new Map<string, string>();
  private readonly now: () => Date;
  private readonly keepDays: () => number;
  private readonly logger: Logger;
  private seeded: Promise<void> | null = null;

  constructor(private readonly deps: PrEventsDeps) {
    this.now = deps.now ?? (() => new Date());
    this.keepDays = deps.keepDays ?? (() => KEEP_DAYS);
    this.logger = deps.logger ?? appLogger;
  }

  hook(e: HookEvent): void {
    if (e.sessionId) {
      this.hookSessions.set(e.tabId, e.sessionId);
    }
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
    const repo = prRepo(pr.url);
    const record = repoRecord(state, repo);
    const key = prKey(repo, pr.number);
    if (record.opened !== key) {
      record.opened = key;
      await this.append('pr.opened', tab, { repo, pr: pr.number });
    }
    await this.ci(record, tab, repo, pr);
    if (pr.state === 'MERGED') {
      await this.merged(record, tab, repo, pr.number);
    }
  }

  async approved(tab: TabState, pr: PrInfo): Promise<void> {
    const state = await this.stateFor(tab);
    if (state === null) {
      return;
    }
    const repo = prRepo(pr.url);
    await this.append('pr.approved', tab, { repo, pr: pr.number });
    await this.merged(repoRecord(state, repo), tab, repo, pr.number);
  }

  async commented(tab: TabState, pr: PrInfo, length: number): Promise<void> {
    if ((await this.stateFor(tab)) !== null) {
      await this.append('review.comment', tab, { repo: prRepo(pr.url), pr: pr.number, length });
    }
  }

  async replied(tab: TabState, pr: PrInfo, commentId: number, length: number): Promise<void> {
    if ((await this.stateFor(tab)) !== null) {
      await this.append('review.reply', tab, { repo: prRepo(pr.url), pr: pr.number, commentId, length });
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
      const tab = tabs().find((t) => tabWorktrees(t).includes(worktree));
      if (tab) {
        void this.pr(tab, pr);
      }
      return pr;
    };
  }

  private async ci(state: RepoRecord, tab: TabState, repo: string, pr: PrInfo): Promise<void> {
    const { passed, pending, total, runs } = pr.checks;
    const failedChecks = runs
      .filter((run) => run.bucket === 'fail')
      .map((run) => run.name)
      .sort();
    const failed = failedChecks.length;
    const key = ciKey(repo, pr.number, passed, failed, failedChecks);
    if (pending !== 0 || total === 0 || state.ci === key) {
      return;
    }
    state.ci = key;
    await this.append('ci.result', tab, { repo, pr: pr.number, passed, failed, failedChecks });
  }

  private async merged(state: RepoRecord, tab: TabState, repo: string, pr: number): Promise<void> {
    const key = prKey(repo, pr);
    if (state.merged === key) {
      return;
    }
    state.merged = key;
    await this.append('pr.merged', tab, { repo, pr });
  }

  private async stateFor(tab: TabState): Promise<Recorded | null> {
    this.seeded ??= this.seed();
    await this.seeded;
    return tab.cardKey === null ? null : this.entry(tab.cardKey);
  }

  private async seed(): Promise<void> {
    const to = this.now();
    const filter = {
      from: new Date(to.getTime() - this.keepDays() * DAY_MS).toISOString(),
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
    const fresh: Recorded = { status: null, repos: new Map() };
    this.recorded.set(card, fresh);
    return fresh;
  }

  private append<T extends keyof Schemas>(type: T, tab: TabState, data: z.input<Schemas[T]>): Promise<void> {
    const session = this.hookSessions.get(tab.id) ?? tab.sessionId;
    const refs = { project: tab.projectKey, card: tab.cardKey, tab: tab.id, session };
    return logFailure(this.logger, 'events', { operation: 'append', type }, async () => {
      await this.deps.log().append(type, refs, data);
    }).catch(() => undefined);
  }
}

export const prEvents = new PrEvents({ log: eventLog, keepDays: eventKeepDays });
