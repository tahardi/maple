import type { Fetched } from '@shared/types/app/fetched';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import { errorText } from '@shared/errors/errorText';

export const SPRINT_TTL_MS = 15_000;

type Entry<T> = { data: T | null; fetchedAt: string; loadedAt: number };

export class SprintCache<T> {
  private readonly last = new Map<string, Entry<T>>();
  private readonly loading = new Map<string, Promise<Fetched<T>>>();
  private generation = 0;

  constructor(
    private readonly load: (p: ProjectConfig) => Promise<T | null>,
    private readonly ttlMs: number = SPRINT_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(p: ProjectConfig): Promise<Fetched<T>> {
    const cached = this.last.get(p.jiraKey);
    if (cached !== undefined && this.now() - cached.loadedAt < this.ttlMs) {
      return Promise.resolve({ data: cached.data, fetchedAt: cached.fetchedAt, error: null });
    }
    const running = this.loading.get(p.jiraKey);
    if (running !== undefined) {
      return running;
    }
    const started = this.fetch(p).finally(() => {
      if (this.loading.get(p.jiraKey) === started) {
        this.loading.delete(p.jiraKey);
      }
    });
    this.loading.set(p.jiraKey, started);
    return started;
  }

  clear(): void {
    this.generation += 1;
    for (const [key, entry] of this.last) {
      this.last.set(key, { ...entry, loadedAt: -Infinity });
    }
    this.loading.clear();
  }

  private async fetch(p: ProjectConfig): Promise<Fetched<T>> {
    const generation = this.generation;
    try {
      const loadedAt = this.now();
      const entry = { data: await this.load(p), fetchedAt: new Date(loadedAt).toISOString(), loadedAt };
      if (generation === this.generation) {
        this.last.set(p.jiraKey, entry);
      }
      return { data: entry.data, fetchedAt: entry.fetchedAt, error: null };
    } catch (err) {
      const cached = this.last.get(p.jiraKey);
      return { data: cached?.data ?? null, fetchedAt: cached?.fetchedAt ?? null, error: errorText(err) };
    }
  }
}
