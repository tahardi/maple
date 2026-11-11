import type { Fetched } from '@shared/types/app';
import type { ProjectConfig } from '@shared/types/config';
import type { PrInfo } from '@shared/types/github';
import type { Dot, TabState } from '@shared/types/tabs';
import { worktreeRepo } from '@shared/worktree';
import { tabWorktrees } from '@shared/tabWorktrees';
import { appLogger, type Logger } from '@main/app/log';
import type { Runner } from '@main/app/preflight';
import { batchKey, fetchPrs, type BatchResult } from './prBatch';

export const POLL_MS = 60_000;

export type PrPollerDeps = {
  tabs: () => TabState[];
  project: (key: string) => Promise<ProjectConfig | null>;
  branch: (worktree: string) => Promise<string>;
  run: Runner;
  logger?: Logger;
  now?: () => Date;
};

type Target = { tabId: string; worktree: string; branch: string; repos: string[] };
type Outcome = Target | { tabId: string; worktree: string; error: Error };

const SETTLED: readonly Dot[] = ['idle', 'ready', 'merged', 'waiting'];

const EMPTY: Fetched<PrInfo> = { data: null, error: null, fetchedAt: null };

function keyOf(tabId: string, worktree: string): string {
  return JSON.stringify([tabId, worktree]);
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function choose(target: Target, batch: BatchResult): PrInfo | null | Error {
  const found: PrInfo[][] = [];
  for (const repo of target.repos) {
    const prs = batch.get(batchKey({ repo, branch: target.branch })) ?? [];
    if (prs instanceof Error) {
      return prs;
    }
    found.push(prs);
  }
  const open = found.find((prs) => prs.some((pr) => pr.state === 'OPEN'));
  return (open ?? found.find((prs) => prs.length > 0))?.[0] ?? null;
}

export class PrPoller {
  private results = new Map<string, Fetched<PrInfo>>();
  private running: Promise<void> | null = null;
  private again = false;
  private readonly log: Logger;
  private readonly now: () => Date;

  constructor(private readonly deps: PrPollerDeps) {
    this.log = deps.logger ?? appLogger;
    this.now = deps.now ?? (() => new Date());
  }

  start(): () => void {
    void this.poll();
    const timer = setInterval(() => {
      if (this.running === null) {
        void this.poll();
      }
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }

  poll(): Promise<void> {
    this.running ??= this.pollOnce().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.poll();
      }
    });
    return this.running;
  }

  refresh(): void {
    if (this.running === null) {
      void this.poll();
      return;
    }
    this.again = true;
  }

  dotChanged(dot: Dot, prev: Dot): void {
    if (dot !== prev && SETTLED.includes(dot)) {
      this.refresh();
    }
  }

  async latest(tabId: string, worktree: string): Promise<Fetched<PrInfo>> {
    const key = keyOf(tabId, worktree);
    while (this.running !== null) {
      await this.running;
    }
    if (!this.results.has(key)) {
      await this.poll();
    }
    return this.results.get(key) ?? EMPTY;
  }

  private async pollOnce(): Promise<void> {
    const fetchedAt = this.now().toISOString();
    const outcomes = await Promise.all(
      this.deps
        .tabs()
        .filter((tab) => tab.kind === 'card')
        .flatMap((tab) => tabWorktrees(tab).map((worktree) => this.target(tab, worktree))),
    );
    const targets = outcomes.filter((o): o is Target => !('error' in o));
    const pairs = new Map(
      targets.flatMap((t) => t.repos.map((repo) => [batchKey({ repo, branch: t.branch }), { repo, branch: t.branch }])),
    );
    const batch = await fetchPrs(this.deps.run, [...pairs.values()]);
    const next = new Map<string, Fetched<PrInfo>>();
    for (const outcome of outcomes) {
      const key = keyOf(outcome.tabId, outcome.worktree);
      const found = 'error' in outcome ? outcome.error : choose(outcome, batch);
      if (!(found instanceof Error)) {
        next.set(key, { data: found, error: null, fetchedAt });
        continue;
      }
      const last = this.results.get(key);
      next.set(key, { data: last?.data ?? null, error: found.message, fetchedAt: last?.fetchedAt ?? null });
      this.log.warn('gh', 'failed', {
        operation: 'pr:poll',
        tabId: outcome.tabId,
        worktree: outcome.worktree,
        error: found.message,
      });
    }
    this.results = next;
  }

  private async target(tab: TabState, worktree: string): Promise<Outcome> {
    try {
      const project = await this.deps.project(tab.projectKey);
      if (project === null) {
        throw new Error(`finding project repo: unknown project ${tab.projectKey}`);
      }
      const branch = await this.deps.branch(worktree);
      const repos = [project.repo, ...project.otherRepos];
      const named = project.otherRepos.length === 0 ? project.repo : worktreeRepo(worktree, repos);
      return { tabId: tab.id, worktree, branch, repos: named === null ? repos : [named] };
    } catch (err) {
      return { tabId: tab.id, worktree, error: asError(err) };
    }
  }
}
