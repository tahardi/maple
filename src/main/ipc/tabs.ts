import { ipcMain } from 'electron';
import { z } from 'zod';
import type { CloseResult } from '@shared/types';
import { appLogger, logFailure, type Logger } from '../log';
import { send, type IpcDeps } from './index';
import { cardKeyArg, handle, on, projectKeyArg, tabIdArg } from './validated';

export function registerTabs({ sessions, status, window, setActiveTab }: IpcDeps, logger: Logger = appLogger): void {
  const logged = <T>(operation: string, args: string[], run: () => T): T =>
    logFailure(logger, 'session', { operation, args }, run);
  ipcMain.handle('tabs:list', () => sessions.list());
  handle('tabs:startCard', z.tuple([projectKeyArg, cardKeyArg]), (projectKey, cardKey) =>
    logged('tabs:startCard', [projectKey, cardKey], () => sessions.startCard(projectKey, cardKey)),
  );
  handle('tabs:openCard', z.tuple([projectKeyArg, cardKeyArg]), (projectKey, cardKey) =>
    logged('tabs:openCard', [projectKey, cardKey], () => sessions.openCard(projectKey, cardKey, null)),
  );
  handle('tabs:openPlanner', z.tuple([projectKeyArg]), (projectKey) =>
    logged('tabs:openPlanner', [projectKey], () => sessions.openPlanner(projectKey, null)),
  );
  handle('tabs:close', z.tuple([tabIdArg, z.boolean()]), (tabId, force): CloseResult => {
    const working = status.statuses().some((s) => s.tabId === tabId && s.dot === 'working');
    if (working && !force) {
      return { closed: false, needsConfirm: true };
    }
    sessions.close(tabId);
    return { closed: true, needsConfirm: false };
  });
  handle('tabs:resume', z.tuple([tabIdArg]), (tabId) => {
    logged('tabs:resume', [tabId], () => {
      sessions.resume(tabId);
    });
  });
  handle('tabs:startFresh', z.tuple([tabIdArg]), (tabId) => {
    logged('tabs:startFresh', [tabId], () => {
      sessions.startFresh(tabId);
    });
  });
  on('tabs:setActive', z.tuple([tabIdArg.nullable()]), (tabId) => {
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
