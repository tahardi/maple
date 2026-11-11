export type ProjectConfig = {
  name: string;
  jiraKey: string;
  jiraBoardId: number;
  plannerDir: string;
  repo: string;
  otherRepos: string[];
};
export type ActionConfig = { label: string; prompt: string };
export type MapleConfig = {
  worktreesDir: string;
  vaultDir: string | null;
  notifications: boolean;
  backgroundWaitMinutes: number;
  eventKeepDays: number;
  eventMaxMegabytes: number;
  stateBackups: number;
  maxWorking: number;
  maxLoadPerCore: number;
  minFreeMegabytes: number;
  projects: ProjectConfig[];
  actions: ActionConfig[];
};
