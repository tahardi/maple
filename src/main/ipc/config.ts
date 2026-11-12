import { currentConfig, reloadConfig } from '@main/app/config/configCache';
import { setAppMenu } from '@main/app/window/menu';
import { z } from 'zod';
import type { IpcDeps } from './index';
import { emit } from './emit';
import { handle } from './handle';

export function registerConfig(deps: IpcDeps): void {
  void reloadConfig();
  const reload = async () => {
    const result = await reloadConfig();
    await deps.configLoaded(result.data);
    emit(deps.window(), 'config', 'onChanged', result);
    return result;
  };
  handle('config', 'get', z.tuple([]), () => currentConfig() ?? reloadConfig());
  handle('config', 'reload', z.tuple([]), reload);
  setAppMenu(
    reload,
    deps.setNotifications,
    deps.setZoom,
    () => {
      emit(deps.window(), 'app', 'onReportRequested');
    },
    () => {
      emit(deps.window(), 'app', 'onShortcutsRequested');
    },
  );
}
