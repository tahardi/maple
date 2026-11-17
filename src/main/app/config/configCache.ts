import type { Fetched } from '@shared/types/app/fetched';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import { loadConfig } from './config';

let cached: Promise<Fetched<MapleConfig>> | null = null;

export function reloadConfig(): Promise<Fetched<MapleConfig>> {
  cached = loadConfig();
  return cached;
}

export function currentConfig(): Promise<Fetched<MapleConfig>> | null {
  return cached;
}

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
