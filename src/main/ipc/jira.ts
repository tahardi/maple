import { ipcMain } from 'electron';

export function registerJira(): void {
  ipcMain.handle('jira:sprint', () => Promise.reject(new Error('jira:sprint is not implemented')));
}
