import { Notification, type BrowserWindow } from 'electron';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabState } from '@shared/types/tabs/tabState';
import { emit } from '@main/ipc/emit';

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
      emit(win, 'tabs', 'onActivate', tab.id);
    }
  });
  notification.show();
}
