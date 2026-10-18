import { app, ipcMain } from 'electron';
import { z } from 'zod';
import { send, type IpcDeps } from './index';
import { handle } from './validated';

export function registerApp({ setNotifications, warnings, sessions, status, window }: IpcDeps): void {
  let confirmed = false;
  handle('app:setNotifications', z.tuple([z.boolean()]), (on) => setNotifications(on));
  ipcMain.handle('app:warnings', () => warnings());
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
