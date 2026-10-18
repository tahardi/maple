import { ipcMain } from 'electron';
import type { CloseResult } from '@shared/types';
import { appLogger, logFailure, type Logger } from '../log';
import { send, type IpcDeps } from './index';

export function registerTabs({ sessions, status, window, setActiveTab }: IpcDeps, logger: Logger = appLogger): void {
  const logged = <T>(operation: string, args: string[], run: () => T): T =>
    logFailure(logger, 'session', { operation, args }, run);
  ipcMain.handle('tabs:list', () => sessions.list());
  ipcMain.handle('tabs:startCard', (_event, projectKey: string, cardKey: string) =>
    logged('tabs:startCard', [projectKey, cardKey], () => sessions.startCard(projectKey, cardKey)),
  );
  ipcMain.handle('tabs:openCard', (_event, projectKey: string, cardKey: string) =>
    logged('tabs:openCard', [projectKey, cardKey], () => sessions.openCard(projectKey, cardKey, null)),
  );
  ipcMain.handle('tabs:openPlanner', (_event, projectKey: string) =>
    logged('tabs:openPlanner', [projectKey], () => sessions.openPlanner(projectKey, null)),
  );
  ipcMain.handle('tabs:close', (_event, tabId: string, force: boolean): CloseResult => {
    const working = status.statuses().some((s) => s.tabId === tabId && s.dot === 'working');
    if (working && !force) {
      return { closed: false, needsConfirm: true };
    }
    sessions.close(tabId);
    return { closed: true, needsConfirm: false };
  });
  ipcMain.handle('tabs:resume', (_event, tabId: string) => {
    logged('tabs:resume', [tabId], () => {
      sessions.resume(tabId);
    });
  });
  ipcMain.handle('tabs:startFresh', (_event, tabId: string) => {
    logged('tabs:startFresh', [tabId], () => {
      sessions.startFresh(tabId);
    });
  });
  ipcMain.on('tabs:setActive', (_event, tabId: string | null) => {
    setActiveTab(tabId);
  });
  ipcMain.handle('tabs:statuses', () => status.statuses());
  status.on('status', (s) => {
    send(window(), 'tabs:status', s);
  });
  sessions.on('changed', (tabs) => {
    send(window(), 'tabs:changed', tabs);
  });
}
