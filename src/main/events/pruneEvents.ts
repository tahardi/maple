import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { dayFiles } from './dayFiles';
import { dayName } from './dayName';

export const KEEP_DAYS = 365;
export const MAX_BYTES = 200 * 1024 * 1024;

export async function pruneEvents(
  dir: string,
  now: Date,
  limits: { keepDays: number; maxBytes: number } = { keepDays: KEEP_DAYS, maxBytes: MAX_BYTES },
): Promise<void> {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - limits.keepDays);
  const oldest = `${dayName(cutoff)}.jsonl`;
  const names = await dayFiles(dir);
  const expired = names.filter((name) => name < oldest);
  const kept = names.filter((name) => name >= oldest);
  await Promise.all(expired.map((name) => rm(join(dir, name), { force: true })));
  const sizes = await Promise.all(kept.map(async (name) => (await stat(join(dir, name))).size));
  let total = sizes.reduce((sum, size) => sum + size, 0);
  for (const [index, name] of kept.entries()) {
    if (total < limits.maxBytes) {
      return;
    }
    await rm(join(dir, name), { force: true });
    total -= sizes[index] ?? 0;
  }
}
