import { Menu, shell } from 'electron';
import { logsDir } from './log';

const NOTIFICATIONS_ID = 'notifications';

export function setAppMenu(
  reloadConfig: () => Promise<unknown>,
  setNotifications: (on: boolean) => Promise<void>,
): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Reload config', accelerator: 'Ctrl+Shift+R', click: () => void reloadConfig() },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Settings',
        submenu: [
          {
            id: NOTIFICATIONS_ID,
            label: 'Desktop notifications',
            type: 'checkbox',
            click: (item) => void setNotifications(item.checked),
          },
        ],
      },
      { role: 'windowMenu' },
      { label: 'Help', submenu: [{ label: 'Open logs', click: () => void shell.openPath(logsDir()) }] },
    ]),
  );
}

export function checkNotifications(on: boolean): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(NOTIFICATIONS_ID);
  if (item) {
    item.checked = on;
  }
}
