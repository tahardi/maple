import { app, dialog, Menu, shell } from 'electron';
import { logsDir } from '@main/app/log/log';
import { aboutDetail, readBuildInfo } from '@main/app/buildInfo';
import type { ZoomChange } from './zoom';

const NOTIFICATIONS_ID = 'notifications';

export function setAppMenu(
  reloadConfig: () => Promise<unknown>,
  setNotifications: (on: boolean) => Promise<void>,
  setZoom: (change: ZoomChange) => Promise<void>,
  reportBug: () => void,
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
          { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => void setZoom('reset') },
          { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', click: () => void setZoom('in') },
          { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => void setZoom('out') },
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
      {
        label: 'Help',
        submenu: [
          { label: 'Report a bug…', click: reportBug },
          { label: 'Open logs', click: () => void shell.openPath(logsDir()) },
          { label: 'About Maple', click: () => void showAbout() },
        ],
      },
    ]),
  );
}

async function showAbout(): Promise<void> {
  const detail = aboutDetail(app.getVersion(), await readBuildInfo(import.meta.dirname));
  await dialog.showMessageBox({ type: 'info', title: 'About Maple', message: 'Maple', detail });
}

export function checkNotifications(on: boolean): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(NOTIFICATIONS_ID);
  if (item) {
    item.checked = on;
  }
}
