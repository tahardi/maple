import { ipcMain } from 'electron';
import { loadConfig } from '../config';
import { setAppMenu } from '../menu';
import { send, type IpcDeps } from './index';

export function registerConfig(deps: IpcDeps): void {
  let cached = loadConfig();
  const reload = async () => {
    cached = loadConfig();
    const result = await cached;
    send(deps.window(), 'config:changed', result);
    return result;
  };
  ipcMain.handle('config:get', () => cached);
  ipcMain.handle('config:reload', reload);
  setAppMenu(reload);
}
