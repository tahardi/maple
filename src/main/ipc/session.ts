import { ipcMain } from 'electron';
import { send, type IpcDeps } from './index';

export function registerSession({ sessions, window }: IpcDeps): void {
  ipcMain.on('session:write', (_event, tabId: string, data: string) => {
    sessions.write(tabId, data);
  });
  ipcMain.on('session:resize', (_event, tabId: string, cols: number, rows: number) => {
    sessions.resize(tabId, cols, rows);
  });
  ipcMain.on('session:sendPrompt', (_event, tabId: string, text: string) => {
    sessions.sendPrompt(tabId, text);
  });
  ipcMain.handle('session:backlog', (_event, tabId: string) => sessions.backlog(tabId));
  sessions.on('data', (tabId, data) => {
    send(window(), `session:data:${tabId}`, data);
  });
  sessions.on('batch', (projectKey, keys) => {
    send(window(), `session:batch:${projectKey}`, keys);
  });
}
