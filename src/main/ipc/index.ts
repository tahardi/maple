import type { BrowserWindow } from 'electron';
import type { ProjectConfig } from '@shared/types';
import type { SessionManager } from '../sessions';
import type { StatusEngine } from '../status';
import type { Terminals } from '../terminals';
import type { ZoomChange } from '../zoom';
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
  setLastProject: (key: string) => Promise<void>;
  lastProject: () => Promise<string | null>;
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
