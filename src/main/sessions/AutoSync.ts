import { syncPrompt } from '@shared/prompts/syncPrompt';
import { tabWorktrees } from '@shared/worktree/tabWorktrees';
import type { Card } from '@shared/types/jira/card';
import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, type Logger } from '@main/app/log/log';
import { withTimeout } from '@main/util/withTimeout';
import type { SessionManager } from './SessionManager';
import type { StatusEngine } from './StatusEngine';
import { errorText } from '@shared/errors/errorText';

export const POLL_MS = 120_000;
export const LOOKUP_TIMEOUT_MS = 30_000;

export type AutoSyncDeps = {
  sessions: SessionManager;
  status: StatusEngine;
  getCard: (key: string) => Promise<Card>;
  pr: (tabId: string, worktree: string) => Promise<Fetched<PrInfo>>;
  logger?: Logger;
};

export class AutoSync {
  private readonly prompted = new Map<string, string>();
  private readonly pending = new Map<string, string[]>();
  private readonly sent = new Map<string, string[]>();
  private readonly log: Logger;
  private active: string | null = null;
  private polling = false;

  constructor(private readonly deps: AutoSyncDeps) {
    this.log = deps.logger ?? appLogger;
    deps.status.on('status', (s, prev) => {
      queueMicrotask(() => {
        this.statusChanged(s.tabId, prev);
      });
    });
  }

  activate(tabId: string | null): void {
    const left = this.active;
    if (left !== null && left !== tabId && this.pending.has(left)) {
      for (const worktree of this.pending.get(left) ?? []) {
        this.prompted.delete(worktree);
      }
      this.pending.delete(left);
      this.deps.status.setSync(left, null);
    }
    this.active = tabId;
    void this.check();
  }

  start(): () => void {
    const timer = setInterval(() => void this.check(), POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }

  async check(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    const tabId = this.active;
    try {
      const tab = tabId === null ? null : this.deps.sessions.get(tabId);
      if (tab !== null) {
        await this.checkTab(tab);
      }
    } finally {
      this.polling = false;
    }
    if (this.active !== tabId) {
      await this.check();
    }
  }

  private async checkTab(tab: TabState): Promise<void> {
    const { cardKey } = tab;
    const alive = this.deps.status.statuses().find((s) => s.tabId === tab.id)?.sessionAlive === true;
    if (tab.kind !== 'card' || cardKey === null || !alive) {
      return;
    }
    const card = await this.attempt('getCard', { card: cardKey }, () => this.deps.getCard(cardKey));
    if (card?.status !== 'In Review') {
      return;
    }
    const prs = await Promise.all(
      tabWorktrees(tab).map(async (worktree) => ({
        worktree,
        pr: await this.attempt('pr', { worktree }, async () => {
          const { data, error } = await this.deps.pr(tab.id, worktree);
          if (error !== null) {
            throw new Error(error);
          }
          return data;
        }),
      })),
    );
    const conflicting = prs.flatMap(({ worktree, pr }) =>
      pr?.state === 'OPEN' && pr.mergeable === 'CONFLICTING' && this.prompted.get(worktree) !== pr.headSha
        ? [{ worktree, headSha: pr.headSha }]
        : [],
    );
    if (conflicting.length === 0 || this.active !== tab.id) {
      return;
    }
    for (const { worktree, headSha } of conflicting) {
      this.prompted.set(worktree, headSha);
    }
    const queued = [...(this.pending.get(tab.id) ?? []), ...conflicting.map(({ worktree }) => worktree)];
    this.pending.set(tab.id, [...new Set(queued)]);
    this.deps.status.setSync(tab.id, 'queued');
  }

  private statusChanged(tabId: string, prev: Dot): void {
    const s = this.deps.status.statuses().find((t) => t.tabId === tabId);
    if (s === undefined || s.sync === null) {
      return;
    }
    if (!s.sessionAlive) {
      for (const worktree of [...(this.pending.get(s.tabId) ?? []), ...(this.sent.get(s.tabId) ?? [])]) {
        this.prompted.delete(worktree);
      }
      this.pending.delete(s.tabId);
      this.sent.delete(s.tabId);
      this.deps.status.setSync(s.tabId, null);
    } else if (s.sync === 'queued' && s.dot !== 'working' && !this.deps.status.asking(s.tabId)) {
      const cardKey = this.deps.sessions.get(s.tabId)?.cardKey ?? null;
      const worktrees = this.pending.get(s.tabId) ?? [];
      this.pending.delete(s.tabId);
      if (cardKey === null) {
        this.deps.status.setSync(s.tabId, null);
        return;
      }
      this.sent.set(s.tabId, worktrees);
      this.deps.sessions.sendPrompt(s.tabId, syncPrompt(cardKey, worktrees));
      this.deps.status.setSync(s.tabId, 'syncing');
    } else if (s.sync === 'syncing' && prev === 'working' && s.dot !== 'working') {
      this.sent.delete(s.tabId);
      this.deps.status.setSync(s.tabId, null);
    }
  }

  private async attempt<T>(
    operation: string,
    where: Record<string, string>,
    step: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await withTimeout(step(), LOOKUP_TIMEOUT_MS);
    } catch (err) {
      const error = errorText(err);
      this.log.warn('session', 'auto-sync failed', { operation, ...where, error });
      return null;
    }
  }
}
