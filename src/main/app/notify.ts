import { Notification, type BrowserWindow } from 'electron';
import type { Dot, TabState } from '@shared/types/tabs';

export function shouldNotify(
  dot: Dot,
  prev: Dot,
  windowFocused: boolean,
  activeTabId: string | null,
  tabId: string,
  enabled: boolean,
): boolean {
  return enabled && dot === 'waiting' && prev !== 'waiting' && !(windowFocused && activeTabId === tabId);
}

export function notifyTab(window: () => BrowserWindow | null, tab: TabState, projectName: string): void {
  const who = tab.cardKey ?? `${projectName} ${tab.kind}`;
  const notification = new Notification({ title: `${who} needs you`, body: projectName });
  notification.on('click', () => {
    const win = window();
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      win.webContents.send('tabs:activate', tab.id);
    }
  });
  notification.show();
}
