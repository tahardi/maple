import { ipcMain } from 'electron';

export function registerPr(): void {
  ipcMain.handle('pr:get', () => Promise.reject(new Error('pr:get is not implemented')));
  ipcMain.handle('pr:approve', () => Promise.reject(new Error('pr:approve is not implemented')));
}
