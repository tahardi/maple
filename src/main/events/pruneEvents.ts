import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import { dayFiles } from './dayFiles';
import { dayName } from './dayName';

export const KEEP_DAYS = 365;
export const MAX_MEGABYTES = 200;

const MEGABYTE = 1024 * 1024;

export const MAX_BYTES = MAX_MEGABYTES * MEGABYTE;

export type PruneLimits = { keepDays: number; maxBytes: number };

export function pruneLimits(config: Pick<MapleConfig, 'eventKeepDays' | 'eventMaxMegabytes'> | null): PruneLimits {
  return {
    keepDays: config?.eventKeepDays ?? KEEP_DAYS,
    maxBytes: (config?.eventMaxMegabytes ?? MAX_MEGABYTES) * MEGABYTE,
  };
}

export async function pruneEvents(
  dir: string,
  now: Date,
  limits: PruneLimits = { keepDays: KEEP_DAYS, maxBytes: MAX_BYTES },
  askDeleteToday: (bytes: number) => Promise<boolean> = () => Promise.resolve(false),
): Promise<string[]> {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - limits.keepDays);
  const oldest = `${dayName(cutoff)}.jsonl`;
  const today = `${dayName(now)}.jsonl`;
  const names = await dayFiles(dir);
  const expired = names.filter((name) => name < oldest);
  const kept = names.filter((name) => name >= oldest);
  await Promise.all(expired.map((name) => rm(join(dir, name), { force: true })));
  const files = await Promise.all(kept.map(async (name) => ({ name, size: (await stat(join(dir, name))).size })));
  let total = files.reduce((sum, file) => sum + file.size, 0);
  const deleted = [...expired];
  for (const { name, size } of files) {
    if (total < limits.maxBytes || (name === today && !(await askDeleteToday(size)))) {
      break;
    }
    await rm(join(dir, name), { force: true });
    deleted.push(name);
    total -= size;
  }
  return deleted;
}
