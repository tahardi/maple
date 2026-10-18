import { ipcMain } from 'electron';

export function registerApp(): void {
  ipcMain.handle('app:setNotifications', () => Promise.reject(new Error('app:setNotifications is not implemented')));
  ipcMain.on('app:confirmQuit', () => undefined);
}
