import type { BrowserWindow } from 'electron';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { Dot } from '@shared/types/tabs/dot';
import type { PrPoller } from '@main/github/PrPoller';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StartQueue } from '@main/sessions/StartQueue';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import type { ZoomChange } from '@main/app/window/zoom';
import { registerApp } from './app';
import { registerConfig } from './config';
import { registerJira } from './jira';
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
  registerPr,
  registerApp,
];

export function registerIpc(deps: IpcDeps): void {
  for (const register of registrars) {
    register(deps);
  }
}

export function send(win: BrowserWindow | null, channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}
