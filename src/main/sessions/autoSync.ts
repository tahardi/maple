import { syncPrompt } from '@shared/prompts';
import type { Card } from '@shared/types/jira';
import type { PrInfo } from '@shared/types/github';
import type { Dot, TabState } from '@shared/types/tabs';
import { appLogger, type Logger } from '@main/app/log';
import { NO_FSMONITOR } from '@main/git/git';
import type { Runner } from '@main/app/preflight';
import type { SessionManager } from './sessions';
import type { StatusEngine } from './status';

export const POLL_MS = 120_000;
export const LS_REMOTE_TIMEOUT_MS = 30_000;
const NETWORK_URL = /^(https:\/\/|ssh:\/\/|\w[\w.-]*@[\w.-]+:)/;
const OUTSIDE_ANY_REPO = '/';

export type AutoSyncDeps = {
  sessions: SessionManager;
  status: StatusEngine;
  getCard: (key: string) => Promise<Card>;
  prFor: (worktree: string, projectKey: string) => Promise<PrInfo | null>;
  run: Runner;
  commonDir: (worktree: string) => Promise<string>;
  originUrl: (repo: string) => Promise<string>;
  logger?: Logger;
};

type SyncTab = TabState & { cardKey: string; worktreePath: string };

export class AutoSync {
  private readonly repos = new Map<string, string>();
  private readonly shas = new Map<string, string>();
  private readonly log: Logger;
  private polling = false;

  constructor(private readonly deps: AutoSyncDeps) {
    this.log = deps.logger ?? appLogger;
    deps.status.on('status', (s, prev) => {
      queueMicrotask(() => {
        this.statusChanged(s.tabId, prev);
      });
    });
  }

  start(): () => void {
    void this.poll();
    const timer = setInterval(() => void this.poll(), POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }

  async poll(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    try {
      const byRepo = new Map<string, SyncTab[]>();
      for (const tab of this.deps.sessions.list()) {
        if (tab.kind !== 'card' || tab.cardKey === null || tab.worktreePath === null) {
          continue;
        }
        const syncTab = { ...tab, cardKey: tab.cardKey, worktreePath: tab.worktreePath };
        const repo = await this.attempt('rev-parse', { worktree: syncTab.worktreePath }, () =>
          this.repoOf(syncTab.worktreePath),
        );
        if (repo !== null) {
          byRepo.set(repo, [...(byRepo.get(repo) ?? []), syncTab]);
        }
      }
      await Promise.all([...byRepo].map(([repo, tabs]) => this.checkRepo(repo, tabs)));
    } finally {
      this.polling = false;
    }
  }

  private async checkRepo(repo: string, tabs: SyncTab[]): Promise<void> {
    const sha = await this.attempt('ls-remote', { repo }, () => this.mainSha(repo));
    if (sha === null) {
      return;
    }
    const last = this.shas.get(repo);
    this.shas.set(repo, sha);
    if (last !== undefined && last !== sha) {
      await Promise.all(tabs.map((tab) => this.checkTab(tab)));
    }
  }

  private async checkTab(tab: SyncTab): Promise<void> {
    const { worktreePath } = tab;
    const card = await this.attempt('getCard', { worktree: worktreePath }, () => this.deps.getCard(tab.cardKey));
    if (card?.status !== 'In Review') {
      return;
    }
    const pr = await this.attempt('prFor', { worktree: worktreePath }, () =>
      this.deps.prFor(worktreePath, tab.projectKey),
    );
    const status = this.deps.status.statuses().find((s) => s.tabId === tab.id);
    if (pr?.state === 'OPEN' && status?.sessionAlive === true) {
      this.deps.status.setSync(tab.id, 'queued');
    }
  }

  private statusChanged(tabId: string, prev: Dot): void {
    const s = this.deps.status.statuses().find((t) => t.tabId === tabId);
    if (s === undefined || s.sync === null) {
      return;
    }
    if (!s.sessionAlive) {
      this.deps.status.setSync(s.tabId, null);
    } else if (s.sync === 'queued' && s.dot !== 'working' && !this.deps.status.asking(s.tabId)) {
      const cardKey = this.deps.sessions.get(s.tabId)?.cardKey ?? null;
      if (cardKey === null) {
        this.deps.status.setSync(s.tabId, null);
        return;
      }
      this.deps.sessions.sendPrompt(s.tabId, syncPrompt(cardKey));
      this.deps.status.setSync(s.tabId, 'syncing');
    } else if (s.sync === 'syncing' && prev === 'working' && s.dot !== 'working') {
      this.deps.status.setSync(s.tabId, null);
    }
  }

  private async repoOf(worktree: string): Promise<string> {
    const cached = this.repos.get(worktree);
    if (cached !== undefined) {
      return cached;
    }
    const repo = await this.deps.commonDir(worktree);
    this.repos.set(worktree, repo);
    return repo;
  }

  private async mainSha(repo: string): Promise<string> {
    const url = await this.deps.originUrl(repo);
    if (!NETWORK_URL.test(url)) {
      throw new Error('checking origin url: url is not https or ssh');
    }
    const { code, stdout, stderr } = await this.deps.run(
      'git',
      [...NO_FSMONITOR, 'ls-remote', url, 'refs/heads/main'],
      OUTSIDE_ANY_REPO,
      LS_REMOTE_TIMEOUT_MS,
    );
    if (code !== 0) {
      throw new Error(`reading main: ${stderr.trim()}`);
    }
    return stdout.trim().split('\t')[0];
  }

  private async attempt<T>(
    operation: string,
    where: { worktree: string } | { repo: string },
    step: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await step();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.warn('session', 'auto-sync failed', { operation, ...where, error });
      return null;
    }
  }
}
