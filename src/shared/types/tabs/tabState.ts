export type TabKind = 'planner' | 'card' | 'vault' | 'learning';

export type TabState = {
  id: string;
  projectKey: string;
  kind: TabKind;
  cardKey: string | null;
  sessionId: string;
  worktreePath: string | null;
  worktreePaths: string[];
};
