import { ipcMain } from 'electron';
import { currentConfig, reloadConfig } from '@main/app/config/configCache';
import { setAppMenu } from '@main/app/window/menu';
import { send, type IpcDeps } from './index';

export function registerConfig(deps: IpcDeps): void {
  void reloadConfig();
  const reload = async () => {
    const result = await reloadConfig();
    await deps.configLoaded(result.data);
    send(deps.window(), 'config:changed', result);
    return result;
  };
  ipcMain.handle('config:get', () => currentConfig());
  ipcMain.handle('config:reload', reload);
  setAppMenu(
    reload,
    deps.setNotifications,
    deps.setZoom,
    () => {
      send(deps.window(), 'app:reportRequested', null);
    },
    () => {
      send(deps.window(), 'app:shortcutsRequested', null);
    },
  );
}
