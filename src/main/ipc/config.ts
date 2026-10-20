import { ipcMain } from 'electron';
import type { Fetched, MapleConfig, ProjectConfig } from '@shared/types';
import { loadConfig } from '../config';
import { setAppMenu } from '../menu';
import { send, type IpcDeps } from './index';

let cached: Promise<Fetched<MapleConfig>> | null = null;

export async function projectByKey(key: string): Promise<ProjectConfig | null> {
  const config = await cached;
  return config?.data?.projects.find((p) => p.jiraKey === key) ?? null;
}

export async function projects(): Promise<ProjectConfig[]> {
  const config = await cached;
  return config?.data?.projects ?? [];
}

export async function vaultDir(): Promise<string | null> {
  const config = await cached;
  return config?.data?.vaultDir ?? null;
}

export async function notificationsDefault(): Promise<boolean> {
  const config = await cached;
  return config?.data?.notifications ?? true;
}

export function registerConfig(deps: IpcDeps): void {
  cached = loadConfig();
  const reload = async () => {
    cached = loadConfig();
    const result = await cached;
    send(deps.window(), 'config:changed', result);
    return result;
  };
  ipcMain.handle('config:get', () => cached);
  ipcMain.handle('config:reload', reload);
  setAppMenu(reload, deps.setNotifications, deps.setZoom);
}
