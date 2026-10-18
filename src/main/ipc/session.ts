import { ipcMain } from 'electron';

export function registerSession(): void {
  ipcMain.on('session:write', () => undefined);
  ipcMain.on('session:resize', () => undefined);
  ipcMain.on('session:sendPrompt', () => undefined);
  ipcMain.handle('session:backlog', () => Promise.reject(new Error('session:backlog is not implemented')));
}
