import type { Fetched, ProjectConfig, Sprint } from '@shared/types';

export class SprintCache {
  private readonly last = new Map<string, { data: Sprint | null; fetchedAt: string }>();

  constructor(private readonly load: (p: ProjectConfig) => Promise<Sprint | null>) {}

  async get(p: ProjectConfig): Promise<Fetched<Sprint>> {
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
