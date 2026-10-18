import { ipcMain } from 'electron';

export function registerRepo(): void {
  ipcMain.handle('repo:changes', () => Promise.reject(new Error('repo:changes is not implemented')));
  ipcMain.handle('repo:listFiles', () => Promise.reject(new Error('repo:listFiles is not implemented')));
  ipcMain.handle('repo:readFile', () => Promise.reject(new Error('repo:readFile is not implemented')));
}
