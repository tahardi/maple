import { app, ipcMain } from 'electron';
import { send, type IpcDeps } from './index';

export function registerApp({ setNotifications, sessions, status, window }: IpcDeps): void {
  let confirmed = false;
  ipcMain.handle('app:setNotifications', (_event, on: boolean) => setNotifications(on));
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
