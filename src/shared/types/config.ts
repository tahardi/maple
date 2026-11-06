export type ProjectConfig = {
  name: string;
  jiraKey: string;
  jiraBoardId: number;
  plannerDir: string;
  repo: string;
};
export type ActionConfig = { label: string; prompt: string };
export type MapleConfig = {
  worktreesDir: string;
  vaultDir: string | null;
  notifications: boolean;
  projects: ProjectConfig[];
  actions: ActionConfig[];
};
