import { ipcMain } from 'electron';

export function registerConfig(): void {
  ipcMain.handle('config:get', () => Promise.reject(new Error('config:get is not implemented')));
  ipcMain.handle('config:reload', () => Promise.reject(new Error('config:reload is not implemented')));
}
