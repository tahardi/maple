import { ipcMain } from 'electron';

export function registerPreflight(): void {
  ipcMain.handle('preflight:run', () => Promise.reject(new Error('preflight:run is not implemented')));
}
