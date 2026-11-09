export type ProjectConfig = {
  name: string;
  jiraKey: string;
  jiraBoardId: number;
  plannerDir: string;
  repo: string;
  otherRepos: string[];
};
export type ActionConfig = { label: string; prompt: string };
export type RemoteConfig = {
  host: string;
  user: string;
  keyPath: string;
  knownHostsPath: string;
  vaultSocket: string | null;
};
export type MapleConfig = {
  worktreesDir: string;
  vaultDir: string | null;
  notifications: boolean;
  backgroundWaitMinutes: number;
  eventKeepDays: number;
  eventMaxMegabytes: number;
  projects: ProjectConfig[];
  actions: ActionConfig[];
  remote: RemoteConfig | null;
};
