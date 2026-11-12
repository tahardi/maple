import { app, ipcMain } from 'electron';
import { dotSchema } from '@main/app/state/dotSchema';
import { z } from 'zod';
import { send, type IpcDeps } from './index';
import { handle, projectKeyArg, tabIdArg } from './validated';

export function registerApp({
  setNotifications,
  warnings,
  setLastProject,
  lastProject,
  setSeen,
  seen,
  sessions,
  status,
  window,
}: IpcDeps): void {
  let confirmed = false;
  handle('app:setNotifications', z.tuple([z.boolean()]), (on) => setNotifications(on));
  ipcMain.handle('app:warnings', () => warnings());
  handle('app:setLastProject', z.tuple([projectKeyArg]), (key) => setLastProject(key));
  ipcMain.handle('app:lastProject', () => lastProject());
  handle('app:setSeen', z.tuple([z.record(tabIdArg, dotSchema)]), (map) => setSeen(map));
  ipcMain.handle('app:seen', () => seen());
  ipcMain.on('app:confirmQuit', () => {
    confirmed = true;
    app.quit();
  });
  app.on('before-quit', (event) => {
    const working = status
      .statuses()
      .filter((s) => s.dot === 'working')
      .flatMap((s) => sessions.get(s.tabId)?.cardKey ?? []);
    if (confirmed || working.length === 0) {
      return;
    }
    event.preventDefault();
    send(window(), 'app:quitRequested', working);
  });
}
