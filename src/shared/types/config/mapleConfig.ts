import type { ProjectConfig } from './projectConfig';
import type { ActionConfig } from './actionConfig';

export type MapleConfig = {
  worktreesDir: string;
  vaultDir: string | null;
  notifications: boolean;
  backgroundWaitMinutes: number;
  eventKeepDays: number;
  eventMaxMegabytes: number;
  stateBackups: number;
  startAtOnce: number;
  startGapSeconds: number;
  maxWorking: number;
  maxLoadPerCore: number;
  minFreeMegabytes: number;
  projects: ProjectConfig[];
  actions: ActionConfig[];
};
