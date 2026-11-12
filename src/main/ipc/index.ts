import type { BrowserWindow } from 'electron';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { Dot } from '@shared/types/tabs/dot';
import type { PrPoller } from '@main/github/PrPoller';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StartQueue } from '@main/sessions/StartQueue';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import type { JiraClient } from '@main/jira/JiraClient';
import type { JiraCreds } from '@main/jira/readCreds';
import type { ZoomChange } from '@main/app/window/zoom/zoom';
import { registerApp } from './app';
import { registerConfig } from './config';
import { registerJira } from './jira';
import { registerLearning } from './learning';
import { registerPr } from './pr';
import { registerPreflight } from './preflight';
import { registerRepo } from './repo';
import { registerSession } from './session';
import { registerTabs } from './tabs';
import { registerTerminal } from './terminal';
import { registerVault } from './vault';

export type IpcDeps = {
  window: () => BrowserWindow | null;
  worktreeFor: (tabId: string) => string | null;
  project: (projectKey: string) => Promise<ProjectConfig | null>;
  sessions: SessionManager;
  terminals: Terminals;
  status: StatusEngine;
  setActiveTab: (tabId: string | null) => void;
  setNotifications: (on: boolean) => Promise<void>;
  setZoom: (change: ZoomChange) => Promise<void>;
  warnings: () => string[];
  configLoaded: (config: MapleConfig | null) => Promise<void>;
  setLastProject: (key: string) => Promise<void>;
  lastProject: () => Promise<string | null>;
  setSeen: (seen: Record<string, Dot>) => Promise<void>;
  seen: () => Promise<Record<string, Dot>>;
  startQueue: StartQueue;
  prs: Pick<PrPoller, 'latest' | 'refresh'>;
  jira: Promise<JiraClient>;
  jiraCreds: Promise<JiraCreds>;
  watchVault: (dir: string) => void;
};

const registrars: readonly ((deps: IpcDeps) => void)[] = [
  registerConfig,
  registerPreflight,
  registerJira,
  registerTabs,
  registerSession,
  registerTerminal,
  registerRepo,
  registerVault,
  registerLearning,
  registerPr,
  registerApp,
];

export function registerIpc(deps: IpcDeps): void {
  for (const register of registrars) {
    register(deps);
  }
}
