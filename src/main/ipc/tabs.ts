import { ipcMain } from 'electron';

export function registerTabs(): void {
  ipcMain.handle('tabs:list', () => Promise.reject(new Error('tabs:list is not implemented')));
  ipcMain.handle('tabs:startCard', () => Promise.reject(new Error('tabs:startCard is not implemented')));
  ipcMain.handle('tabs:openCard', () => Promise.reject(new Error('tabs:openCard is not implemented')));
  ipcMain.handle('tabs:openPlanner', () => Promise.reject(new Error('tabs:openPlanner is not implemented')));
  ipcMain.handle('tabs:close', () => Promise.reject(new Error('tabs:close is not implemented')));
  ipcMain.handle('tabs:resume', () => Promise.reject(new Error('tabs:resume is not implemented')));
  ipcMain.handle('tabs:startFresh', () => Promise.reject(new Error('tabs:startFresh is not implemented')));
  ipcMain.on('tabs:setActive', () => undefined);
  ipcMain.handle('tabs:statuses', () => Promise.reject(new Error('tabs:statuses is not implemented')));
}
