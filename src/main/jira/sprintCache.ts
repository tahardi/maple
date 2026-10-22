import type { Fetched, ProjectConfig } from '@shared/types';

export class SprintCache<T> {
  private readonly last = new Map<string, { data: T | null; fetchedAt: string }>();

  constructor(private readonly load: (p: ProjectConfig) => Promise<T | null>) {}

  async get(p: ProjectConfig): Promise<Fetched<T>> {
    try {
      const entry = { data: await this.load(p), fetchedAt: new Date().toISOString() };
      this.last.set(p.jiraKey, entry);
      return { ...entry, error: null };
    } catch (err) {
      const cached = this.last.get(p.jiraKey);
      return { data: cached?.data ?? null, fetchedAt: cached?.fetchedAt ?? null, error: errorMessage(err) };
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
