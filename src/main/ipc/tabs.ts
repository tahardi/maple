import { ipcMain } from 'electron';
import { z } from 'zod';
import type { CloseResult } from '@shared/types/tabs/closeResult';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { sessionCost } from '@main/sessions/transcripts/sessionCost';
import { send, type IpcDeps } from './index';
import { closeNeedsConfirm } from './closeNeedsConfirm';
import { cardKeyArg, handle, on, projectKeyArg, tabIdArg } from './validated';

export function registerTabs(
  { sessions, terminals, status, window, setActiveTab, startQueue }: IpcDeps,
  logger: Logger = appLogger,
  costOf: typeof sessionCost = sessionCost,
): void {
  const logged = <T>(operation: string, args: string[], run: () => T): T =>
    logFailure(logger, 'session', { operation, args }, run);
  ipcMain.handle('tabs:list', () => sessions.list());
  handle('tabs:startCard', z.tuple([projectKeyArg, cardKeyArg]), (projectKey, cardKey) =>
    logged('tabs:startCard', [projectKey, cardKey], () => startQueue.add(projectKey, cardKey)),
  );
  handle('tabs:openCard', z.tuple([projectKeyArg, cardKeyArg]), (projectKey, cardKey) =>
    logged('tabs:openCard', [projectKey, cardKey], () => sessions.openCard(projectKey, cardKey, null)),
  );
  handle('tabs:openPlanner', z.tuple([projectKeyArg]), (projectKey) =>
    logged('tabs:openPlanner', [projectKey], () => sessions.openPlanner(projectKey, null)),
  );
  handle('tabs:openVault', z.tuple([projectKeyArg]), (projectKey) =>
    logged('tabs:openVault', [projectKey], () => sessions.openVault(projectKey, null)),
  );
  handle('tabs:close', z.tuple([tabIdArg, z.boolean()]), (tabId, force): CloseResult => {
    if (closeNeedsConfirm(status.statuses(), tabId, force)) {
      return { closed: false, needsConfirm: true };
    }
    sessions.close(tabId);
    terminals.closeTab(tabId);
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
  handle('tabs:selectWorktree', z.tuple([tabIdArg, z.string().min(1).max(4096)]), (tabId, path) => {
    logged('tabs:selectWorktree', [tabId, path], () => {
      sessions.selectWorktree(tabId, path);
    });
  });
  on('tabs:setActive', z.tuple([tabIdArg.nullable()]), (tabId) => {
    setActiveTab(tabId);
  });
  handle('tabs:cost', z.tuple([tabIdArg]), (tabId) =>
    logged('tabs:cost', [tabId], () => {
      const tab = sessions.get(tabId);
      return tab ? costOf(tab.sessionId) : null;
    }),
  );
  ipcMain.handle('tabs:startQueue', () => startQueue.state());
  handle('tabs:unqueue', z.tuple([cardKeyArg]), (cardKey) => {
    startQueue.remove(cardKey);
  });
  handle('tabs:moveQueued', z.tuple([cardKeyArg, z.union([z.literal(-1), z.literal(1)])]), (cardKey, offset) => {
    startQueue.move(cardKey, offset);
  });
  ipcMain.handle('tabs:statuses', () => status.statuses());
  status.on('status', (s) => {
    send(window(), 'tabs:status', s);
  });
  sessions.on('changed', (tabs) => {
    send(window(), 'tabs:changed', tabs);
  });
  startQueue.on('changed', (state) => {
    send(window(), 'tabs:queue', state);
  });
}
