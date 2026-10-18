import { ipcMain } from 'electron';
import type { CloseResult } from '@shared/types';
import { send, type IpcDeps } from './index';

export function registerTabs({ sessions, window }: IpcDeps): void {
  ipcMain.handle('tabs:list', () => sessions.list());
  ipcMain.handle('tabs:startCard', (_event, projectKey: string, cardKey: string) =>
    sessions.startCard(projectKey, cardKey),
  );
  ipcMain.handle('tabs:openCard', (_event, projectKey: string, cardKey: string) =>
    sessions.openCard(projectKey, cardKey, null),
  );
  ipcMain.handle('tabs:openPlanner', (_event, projectKey: string) => sessions.openPlanner(projectKey, null));
  ipcMain.handle('tabs:close', (_event, tabId: string): CloseResult => {
    sessions.close(tabId);
    return { closed: true, needsConfirm: false };
  });
  ipcMain.handle('tabs:resume', (_event, tabId: string) => {
    sessions.resume(tabId);
  });
  ipcMain.handle('tabs:startFresh', (_event, tabId: string) => {
    sessions.startFresh(tabId);
  });
  ipcMain.on('tabs:setActive', () => undefined);
  ipcMain.handle('tabs:statuses', () => Promise.reject(new Error('tabs:statuses is not implemented')));
  sessions.on('changed', (tabs) => {
    send(window(), 'tabs:changed', tabs);
  });
}
