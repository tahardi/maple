import { ipcMain } from 'electron';
import type { IpcDeps } from './index';

export function registerApp({ setNotifications }: IpcDeps): void {
  ipcMain.handle('app:setNotifications', (_event, on: boolean) => setNotifications(on));
  ipcMain.on('app:confirmQuit', () => undefined);
}
